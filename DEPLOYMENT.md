# Deployment Guide

## A. Local deployment

### Requirements
Install Node.js 20+ or use Docker.

### Start

```bash
npm test
npm start
```

Visit `http://localhost:3000`. If port 3000 is occupied, set `PORT=3001` before starting.

PowerShell:

```powershell
$env:PORT=3001
node server.js
```

### Docker

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f wayfare
```

Open `http://localhost:3000`. To stop the service, run `docker compose down`. The named volume preserves demo bookings.

## B. AWS deployment path (recommended)

This is a deployment plan, not an already-created AWS environment. It requires an AWS account, permissions, region choice, and review of estimated costs.

1. **Prepare the production application**
   - Replace `data/bookings.json` with DynamoDB or RDS persistence.
   - Add authentication, owner-level authorization, idempotency keys, structured logs, and automated database migrations if applicable.
   - Add unit/integration tests and load tests.
2. **Create an ECR repository** and build/push the Docker image.
3. **Create an ECS Fargate service** in private subnets across at least two Availability Zones.
4. **Place an Application Load Balancer** in public subnets and route traffic to the ECS target group. Restrict task security-group ingress to the ALB.
5. **Configure health checks** to use `/api/health`; add a deployment circuit breaker and rollback.
6. **Configure Auto Scaling** with minimum, desired, and maximum task counts. Use target tracking for CPU/memory and evaluate ALB request count per target using observed traffic.
7. **Configure a managed data store** (DynamoDB or RDS), backups/point-in-time recovery, encryption, and least-privilege IAM.
8. **Add Route 53 and ACM TLS** for a domain. Optionally place CloudFront and AWS WAF in front of the service.
9. **Configure CloudWatch** logs, dashboards, latency/error alarms, and alarms for database throttling/capacity.
10. **Validate** with the test suite, smoke tests, and load tests before directing production traffic.

## C. Suggested release checks

- [ ] `/api/health` returns HTTP 200.
- [ ] Route catalog returns the expected routes.
- [ ] Fare is calculated server-side and tampered prices are ignored.
- [ ] Invalid dates, email, quantity, route and pass are rejected.
- [ ] Ticket code retrieves only an authorized booking in the production implementation.
- [ ] Load test confirms acceptable latency at target traffic.
- [ ] Auto Scaling adds and removes capacity as expected.
- [ ] Database backup and restore have been tested.
- [ ] HTTPS, WAF, IAM least privilege, secrets, alarms and rollback are configured.
- [ ] No test passenger details or credentials are included in the deployment artifact.

## D. Operational note

The included Docker setup is suitable for a local demonstration. Do not deploy the bundled JSON-file persistence as a multi-replica production service: it can lose updates under concurrent writes and does not provide database-grade durability or coordination.