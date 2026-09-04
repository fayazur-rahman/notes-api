# Troubleshooting / Runbook — notes-api deployment


## SSH: "Permission denied (publickey)"
- Wrong key or path → check `-i ~/.ssh/notes-api-key.pem`.
- Key perms too open → `chmod 400 ~/.ssh/notes-api-key.pem`.
- Wrong user → Ubuntu AMIs use `ubuntu@`, not `root@` or `ec2-user@`.
- Key pair doesn't match the instance → confirm the instance's key pair name.


## SSH: "Connection timed out"
- Your public IP changed (common on home/mobile ISPs) → the SG's `22 → my-IP/32`
  rule no longer matches. Fix: EC2 → Security Group → Inbound → edit the SSH rule
  to your new IP (`curl -s ifconfig.me` shows it).
- Instance is stopped → start it (and note the public IP changes unless an Elastic IP is attached).
- Using the wrong IP → use the Elastic IP.
## Locked out after `ufw enable`
- Cause: enabled the host firewall without `sudo ufw allow OpenSSH` first.
- Recover: EC2 → Instance → Connect → **EC2 Serial Console**, log in, `sudo ufw allow OpenSSH`.


## Locked out after disabling password auth
- Cause: key auth wasn't actually working before enforcing no-password.
- Prevention: ALWAYS verify key login in a second terminal before trusting the change.
- Recover: EC2 Serial Console, or detach the root volume and fix `sshd_config.d/`.


## Public IP keeps changing
- No Elastic IP attached, or instance was stopped/started. Attach an Elastic IP and
  always SSH to that address.


## Hardening applied (2026-08-31)
- SG: 22 ← my IP only; 80/443 ← all. ufw: 22/80/443 allowed, enabled.
- SSH: `PasswordAuthentication no`, `PermitRootLogin no` via `sshd_config.d/99-hardening.conf`.
- `unattended-upgrades` enabled.

## App on EC2 — run procedure & fixes


### Run the stack on the box
```bash
export REGION=us-east-1; 
export ACCOUNT_ID=034866042287
export REGISTRY=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

docker pull $REGISTRY/notes-api:0.1.0

docker network create notesnet   # once

#Create postgres container
docker run -d --name notes-db --network notesnet -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_USER=notes_app -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=notes_db \
  --restart unless-stopped postgres:16

#Create notes-api container
docker run -d --name notes-api --network notesnet --env-file .env -p 80:3000 \
  --restart unless-stopped $REGISTRY/notes-api:0.1.0
```


### /health returns 500 (not 200)
- App is up but can't reach the DB. Check `docker logs notes-api` for ECONNREFUSED.
- Both containers on `notesnet`? (`docker network inspect notesnet`). DB_HOST must be the
  DB container name (`notes-db`), and app DB_* must match Postgres POSTGRES_*.


### curl from laptop times out but works on the box
- Security group isn't allowing 80 (should be 0.0.0.0/0), or you're curling https not http.


### ECR pull fails with "denied" on the instance
- Instance role missing/not attached, or lacks AmazonEC2ContainerRegistryReadOnly.
- Re-run get-login-password (12h token). Confirm role: `aws sts get-caller-identity`
  should show assumed-role/notes-api-ec2-role, not user/kayes-admin.

## Nginx reverse proxy (W5 D3)


### Topology
Internet → SG:80 → Nginx (host) → 127.0.0.1:3000 → app container.
App publishes to loopback only (`-p 127.0.0.1:3000:3000`) — not internet-reachable directly.


### Config: /etc/nginx/sites-available/notes-api
- `upstream notes_api { server 127.0.0.1:3000; }` + `proxy_pass http://notes_api;`
- proxy_set_header: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto (last one needed for TLS in W7).
- Enable: symlink into sites-enabled; `rm` the default site (duplicate default_server otherwise).
- `sudo nginx -t` → `sudo systemctl reload nginx` → `sudo systemctl enable nginx`.


### 502 Bad Gateway
- Meaning: Nginx is UP but the backend didn't answer. NOT an Nginx problem.
- Check the CONTAINER: `docker ps` (is notes-api running?), `docker logs notes-api`.
- Nginx side confirms it: /var/log/nginx/error.log shows "connect() failed ... upstream 127.0.0.1:3000".
- Fix: start/fix the app container; 502 clears.


### Timeout / connection refused (NOT 502)
- That's Nginx itself down or SG blocking 80 → `systemctl status nginx`, check the security group.


### Nginx won't start after install
- Port 80 already held (app still published on :80). Free it first: re-run app on 127.0.0.1:3000.
  Diagnose with `ss -tulpn | grep :80`.

## RDS (managed Postgres) — W5 D4


### Switch the app to RDS (env-only, no rebuild)
- `.env`: DB_HOST = RDS endpoint, DB_PASSWORD = RDS master password. DB_USER/DB_NAME unchanged.
- Recreate app container (no --network needed; reaches RDS over the VPC by endpoint).
- The app's startup `initialize()` (CREATE TABLE IF NOT EXISTS) IS the migration.


### App times out connecting to RDS
- Timeout (not "refused") = firewall/SG silently dropping packets, not a DB problem.
- Fix: RDS security group (`notes-rds-sg`) inbound → PostgreSQL 5432 → Source = the EC2
  instance's security group (SG-to-SG, NOT an IP). RDS must be Public access: No.


### App log: "no pg_hba.conf entry ... no encryption" / "SSL required"  (NOT a timeout)
- RDS is enforcing TLS (rds.force_ssl=1 on the parameter group).
- Fix: RDS → Parameter groups → create one for your PG family → set `rds.force_ssl = 0`
  → attach to the instance (Modify) → reboot RDS.
- Tell-tale: `psql` connects fine (libpq negotiates SSL) but the app doesn't → it's force_ssl.


### Connect to RDS directly (from the EC2 box only — RDS isn't public)
```bash
psql -h <rds-endpoint> -U notes_app -d notes_db
\dt ; SELECT * FROM notes; \q
```


### Why psql works on the box but not the laptop
- RDS has only a private IP inside the VPC (Public access: No). The EC2 box is in the same
  VPC and can route to it; the laptop is outside the VPC with no route. Not a permission issue.

