# System Architecture — Cloud-Based Bus Pass System

## 1. Project objective

Provide a reliable and scalable online bus pass booking experience. The design aims to reduce lost tickets through digital retrieval, prevent incorrect fares through server-side calculation, and support high traffic through horizontal scaling.

## 2. Local demo architecture

```text
                   ┌──────────────────────────┐
                   │ User browser / responsive│
                   │ HTML + CSS + JavaScript  │
                   └────────────┬─────────────┘
                                │ HTTPS in production
                                ▼
                   ┌──────────────────────────┐
                   │ Node.js HTTP application │
                   │ validation + fare rules  │
                   │ ticket code generation   │
                   └────────────┬─────────────┘
                                │
                                ▼
                   ┌──────────────────────────┐
                   │ bookings.json            │
                   │ local demo persistence   │
                   └──────────────────────────┘
```

## 3. Recommended AWS production architecture

```text
   Passengers
       │
       ▼
 Route 53 (DNS)
       │
       ▼
 CloudFront + AWS WAF
       │
       ├──────────────► S3 (static assets / ticket PDFs if implemented)
       │
       ▼
 Application Load Balancer
       │
       ▼
 ECS Fargate service (private subnets)
  ┌────────────┬────────────┬────────────┐
  │ App task 1 │ App task 2 │ App task N │  ◄── Auto Scaling
  └─────┬──────┴─────┬──────┴─────┬──────┘
        └─────────────┼────────────┘
                      ▼
              Amazon DynamoDB
        (bookings, conditional writes,
         idempotency keys, status)
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   Amazon EventBridge        Amazon CloudWatch
   scheduled workflows       logs, metrics, alarms
          │
          ▼
   AWS Lambda workers
   (notifications / expiry)
          │
          ▼
   Amazon SES / SQS (optional)

   Secrets Manager / IAM / KMS / CloudTrail
   protect secrets, permissions, encryption, audit
```

## 4. Core flow

1. The browser fetches the route catalog from `GET /api/routes`.
2. The user selects a route, pass type, date, and quantity.
3. The browser sends booking details to `POST /api/bookings`.
4. The API validates all fields. It ignores any price fields from the client.
5. The API calculates price using trusted route and pass configuration.
6. The booking service generates a unique booking ID and ticket code.
7. In the local demo, the booking is written to JSON. In production, use a DynamoDB conditional write or relational transaction.
8. The user receives the ticket code and can retrieve the booking with `GET /api/bookings/:ticketCode`.

## 5. Requirement-to-design mapping

| Requirement | Implementation / production design |
|---|---|
| Ticket loss prevention | Digital booking record and ticket-code lookup; production should also support authenticated booking history and emailed receipts. |
| Ticket theft prevention | Random ticket code, no sequential identifiers, security headers. Production must add identity verification, rate limiting at the edge, and owner checks for personal data. |
| Incorrect pricing prevention | Server calculates the fare from configured route base fare and pass multiplier; submitted prices are ignored. |
| High traffic | Dockerized app can be replicated behind an ALB; ECS Service Auto Scaling adjusts task count. |
| Reliability | Health endpoint, multiple tasks across Availability Zones, managed database, alarms, backups and deployment rollback. |
| Seamless booking | Responsive UI, validation, instant confirmation and ticket lookup. |

## 6. Scalability and reliability improvements

### Stateless app layer
Keep application instances replaceable. Store bookings and sessions outside app containers. Use a managed database rather than local files before enabling more than one replica.

### Dynamic scaling
Configure ECS Service Auto Scaling using CPU and memory targets and, where appropriate, ALB request count per target. Establish minimum and maximum task counts and validate scaling under load. Do not scale on CPU alone without observing request latency and database capacity.

### Data correctness
Use DynamoDB conditional writes or an RDS transaction for booking creation. Add an idempotency key so client retries do not create duplicate bookings. If seat/pass inventory is introduced, reserve capacity using a conditional update or transaction.

### Availability and recovery
Run tasks in at least two Availability Zones. Enable point-in-time recovery/backups for the database, health checks, CloudWatch alarms, and a tested rollback process. Define recovery time and recovery point objectives.

### Security and privacy
Use HTTPS, least-privilege IAM task roles, encryption at rest and in transit, Secrets Manager for credentials, AWS WAF rules, CloudTrail audit logs, and data retention/deletion policies. Never place credentials in source code.

## 7. Why JSON storage is not production storage

The bundled app uses atomic file replacement to make the single-process demo more robust. However, it has no transaction isolation, concurrent multi-instance coordination, automated backup, or database-level constraints. Multiple app instances must not share this JSON-file design. Replace it with DynamoDB or RDS before horizontal scaling or processing real bookings.

## 8. Future enhancements

- Sign-in with Amazon Cognito and authenticated ticket history.
- Payment gateway integration with verified webhooks.
- QR ticket generation and conductor validation.
- Inventory and seat/capacity management with atomic reservations.
- Email/SMS notifications through SES/SNS.
- Idempotent booking API and cancellation/refund workflow.
- Infrastructure as Code using AWS CDK, CloudFormation, or Terraform.
- Load testing with k6 or JMeter and documented target thresholds.