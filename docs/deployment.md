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


---


# PART D — Rollback


Broken release? Redeploy the previous pinned tag — same as PART C with the old <VERSION>.
```bash
docker pull $REGISTRY/notes-api:<PREVIOUS_VERSION>
docker rm -f notes-api
docker run -d --name notes-api --env-file /home/ubuntu/.env \
  -p 127.0.0.1:3000:3000 --restart unless-stopped \
  $REGISTRY/notes-api:<PREVIOUS_VERSION>
```
Then run PART E. (Pinned tags are why rollback is one line — `latest` couldn't do this.)
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


# Troubleshooting
See [troubleshooting.md](troubleshooting.md) — SSH lockout, 502, RDS timeout, ECR auth, IP change.


# Teardown (end of Phase 1 — stop the meter)
- `docker rm -f notes-api` (optional).
- EC2 → terminate `notes-api-server`. EC2 → Elastic IPs → **release** the address.
- RDS → **delete** `notes-db` (optional final snapshot) — deleting, not stopping.
- ECR → delete the `notes-api` repo when the image is no longer needed.
- Verify in Cost Explorer a day later that charges have stopped.

