# Deployment Runbook — notes-api


Live stack: an Express + Postgres API, containerized, running on an EC2 instance in
us-east-1 behind an Nginx reverse proxy, backed by managed RDS Postgres.


```
Internet → SG:80 → Nginx (EC2 host) → 127.0.0.1:3000 → app container → RDS Postgres (private)
                                                          image pulled from ECR
```


## Constants


| Thing | Value |
|---|---|
| Region | us-east-1 |
| AWS account | 034866042287 |
| ECR registry | 034866042287.dkr.ecr.us-east-1.amazonaws.com |
| Image repo | notes-api |
| EC2 instance | notes-api-server (t2.micro) |
| RDS instance | notes-db (db.t3.micro), DB `notes_db`, user `notes_app` |
| RDS SG | notes-rds-sg (inbound 5432 ← EC2 instance SG) |
| SSH | `ssh -i ~/.ssh/notes-api-key.pem ubuntu@<ELASTIC_IP>` |


## Secrets (sources, never values)
- `DB_PASSWORD` = the RDS master password set when the RDS instance was created.
- Lives only in `/home/ubuntu/.env` on the server (gitignored, never committed).
- SSH private key: `~/.ssh/notes-api-key.pem` on the laptop only.


---


# PART A — One-time infrastructure setup (run ONCE)


> These stand the environment up. Do not re-run blindly (they error/duplicate).


### A1. ECR repository
```bash
aws ecr create-repository --repository-name notes-api --region us-east-1
```
Verify: `aws ecr describe-repositories --repository-name notes-api --region us-east-1`.


### A2. EC2 instance + security group + key + Elastic IP
- Launch Ubuntu 24.04 LTS, t2.micro. Key pair: notes-api-key (ED25519, .pem) → `chmod 400`.
- Security group inbound: SSH 22 ← my IP/32 ; HTTP 80 ← 0.0.0.0/0 ; HTTPS 443 ← 0.0.0.0/0.
- Allocate an Elastic IP and associate it to the instance.
Verify: `ssh -i ~/.ssh/notes-api-key.pem ubuntu@<ELASTIC_IP>` connects.


### A3. Host hardening (on the box)
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
# /etc/ssh/sshd_config.d/99-hardening.conf: PasswordAuthentication no / PermitRootLogin no
sudo sshd -t && sudo systemctl restart ssh   # confirm key login in a 2nd terminal first
sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```


### A4. IAM role for ECR pull
- IAM → Roles → EC2 → attach `AmazonEC2ContainerRegistryReadOnly` → name `notes-api-ec2-role`.
- EC2 → instance → Actions → Security → Modify IAM role → attach it.
Verify: on the box, `aws sts get-caller-identity` shows `assumed-role/notes-api-ec2-role`.


### A5. Docker + AWS CLI on the box
```bash
sudo apt update && sudo apt install -y unzip
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscli.zip
unzip -q awscli.zip && sudo ./aws/install
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # then log out/in
```


### A6. RDS Postgres + SG-to-SG rule
- RDS → Create database → PostgreSQL → Free tier. Id notes-db, user notes_app, size db.t3.micro,
  storage 20GB (no autoscaling), Public access NO, new SG notes-rds-sg, initial DB notes_db.
- notes-rds-sg inbound: PostgreSQL 5432 ← source = the EC2 instance's security group.
Verify: from the box, `psql -h <RDS_ENDPOINT> -U notes_app -d notes_db` connects.


### A7. Nginx reverse proxy (on the box)
- `/etc/nginx/sites-available/notes-api`: upstream 127.0.0.1:3000 ; proxy_pass ; proxy headers
  (Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto).
- Symlink into sites-enabled, `rm` the default site, `sudo nginx -t`, `sudo systemctl reload nginx`,
  `sudo systemctl enable nginx`.
Verify: `curl -i http://<ELASTIC_IP>/health` → 200 (after Part C runs the app).


### A8. Server .env (create once, update on secret change)
```bash
# /home/ubuntu/.env  — gitignored, server-only
DB_HOST=<RDS_ENDPOINT>
DB_PORT=5432
DB_USER=notes_app
DB_PASSWORD=<the RDS master password>
DB_NAME=notes_db
PORT=3000
```


---


# PART B — Build & publish a new image version (from laptop, run PER RELEASE)


Bump the version tag for each release (e.g. 0.1.0 → 0.1.1). Do NOT deploy `latest`.
```bash
export REGISTRY=034866042287.dkr.ecr.us-east-1.amazonaws.com
docker build -t notes-api:<VERSION> .
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $REGISTRY
docker tag  notes-api:<VERSION> $REGISTRY/notes-api:<VERSION>
docker push $REGISTRY/notes-api:<VERSION>
```
Verify: `aws ecr describe-images --repository-name notes-api --region us-east-1 --query 'imageDetails[].imageTags'`.

> NOTE: PART B is now automated by CI (.github/workflows/ci.yml) on every push to main —
> it builds and pushes an image tagged with the commit SHA (and latest) via OIDC.
> The manual steps below remain valid for a break-glass build from a laptop.

---


# PART C — Deploy / update on the server (run PER RELEASE, re-runnable)


```bash
ssh -i ~/.ssh/notes-api-key.pem ubuntu@<ELASTIC_IP>
export REGISTRY=034866042287.dkr.ecr.us-east-1.amazonaws.com


# 1. authenticate to ECR (token lasts ~12h)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $REGISTRY


# 2. pull the version you're deploying
docker pull $REGISTRY/notes-api:<VERSION>


# 3. swap the container (rm -f makes this safe to re-run)
docker rm -f notes-api 2>/dev/null
docker run -d \
  --name notes-api \
  --env-file /home/ubuntu/.env \
  -p 127.0.0.1:3000:3000 \
  --restart unless-stopped \
  $REGISTRY/notes-api:<VERSION>
```
Verify (see PART E).

> NOTE: PART C is now automated by the `deploy` job in .github/workflows/ci.yml — every push
> to main that passes tests + builds + pushes then SSHes to the box and runs these exact steps
> with the new commit's SHA tag. The manual steps below remain the break-glass procedure.

---


# PART D — Rollback (break-glass, tested — under 2 min)


Recovery does NOT use CI (CI may be the broken thing). SSH in as yourself and redeploy
the previous SHA (still in ECR, usually still on the box).


1. Find the previous SHA:
   `aws ecr describe-images --repository-name notes-api --region us-east-1 \
     --query 'reverse(sort_by(imageDetails,&imagePushedAt))[:3].imageTags' --output table`
2. Roll back:
```bash
ssh -i ~/.ssh/notes-api-key.pem ubuntu@<ELASTIC_IP>
export REGISTRY=034866042287.dkr.ecr.us-east-1.amazonaws.com
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $REGISTRY
docker pull $REGISTRY/notes-api:<PREVIOUS_SHA>
docker rm -f notes-api
docker run -d --name notes-api --env-file /etc/notes-api.env \
  -p 127.0.0.1:3000:3000 --restart unless-stopped $REGISTRY/notes-api:<PREVIOUS_SHA>
```
3. Verify: `curl -i http://<ELASTIC_IP>/health` → 200 (previous behaviour).
4. Roll forward when ready: same steps with the newest SHA, or re-run the pipeline.


## Deploy credentials (least privilege)
- CI deploys as the `deploy` user (docker group, NO sudo) with a dedicated key (EC2_SSH_KEY).
- Runtime secrets: /etc/notes-api.env (root:docker 640) — readable by ubuntu + deploy, no one else.
- Rotate the deploy key: ssh-keygen new pair → add pub to /home/deploy/.ssh/authorized_keys →
  update GitHub secret EC2_SSH_KEY → remove old pub key.
- Break-glass rollback uses YOUR personal key as `ubuntu` (full access), independent of CI.

---


# PART E — Smoke test (after every deploy/rollback)


```bash
# on the box:
docker ps                       # notes-api Up
docker logs --tail 20 notes-api # "Notes API listening on port 3000"


# from the laptop:
curl -i http://<ELASTIC_IP>/health                       # 200 {"status":"ok"}
curl -s -X POST http://<ELASTIC_IP>/notes \
  -H 'Content-Type: application/json' -d '{"title":"smoke","body":"test"}'   # 201
curl -s http://<ELASTIC_IP>/notes                        # includes the note
```
A 200 from /health proves app + Nginx + RDS are all healthy at once.


---

### A.x Domain + HTTPS (one-time)
1. DNS: at the domain's DNS host, add `A  notes  <Elastic IP>  TTL 300` (Cloudflare: DNS only / grey cloud).
   Verify: `dig +short notes.yourdomain.com` → Elastic IP.
2. Nginx: set `server_name notes.yourdomain.com;` in /etc/nginx/sites-available/notes-api → `nginx -t` → reload.
   Verify: `curl -i http://notes.yourdomain.com/health` → 200.
3. TLS: `sudo apt install -y certbot python3-certbot-nginx`
   `sudo certbot --nginx -d notes.yourdomain.com -m fayazur8@gmail.com --agree-tos --no-eff-email --redirect`
   Verify: `curl -i https://notes.yourdomain.com/health` → 200; http → 301; `sudo certbot renew --dry-run` succeeds.
4. Monitoring: canary URL = https://notes.yourdomain.com/health (every 15 min; alarm period 15 min).
Notes: cert + key live in /etc/letsencrypt/live/<domain>/ (never in Git). Renewal = certbot.timer.
Requires SG + ufw 80/443 open (HTTP-01 challenge needs :80).



# Troubleshooting
See [troubleshooting.md](troubleshooting.md) — SSH lockout, 502, RDS timeout, ECR auth, IP change.


# Teardown (end of Phase 1 — stop the meter)
- `docker rm -f notes-api` (optional).
- EC2 → terminate `notes-api-server`. EC2 → Elastic IPs → **release** the address.
- RDS → **delete** `notes-db` (optional final snapshot) — deleting, not stopping.
- ECR → delete the `notes-api` repo when the image is no longer needed.
- Verify in Cost Explorer a day later that charges have stopped.

