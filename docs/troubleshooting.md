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
