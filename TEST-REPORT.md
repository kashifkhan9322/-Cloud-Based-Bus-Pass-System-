# Test Report

## Test environment

- Runtime: Node.js 20+ (recommended Node.js 22)
- Test framework: built-in `node:test` and `node:assert/strict`
- Server: temporary local HTTP process
- Storage: isolated temporary directory per test run
- External services: none

## Automated test coverage

| # | Test | Expected result |
|---:|---|---|
| 1 | Health endpoint | HTTP 200 and `status: ok` |
| 2 | Route catalog | Four routes and pass-type definitions |
| 3 | Client tampers with fare | Server returns configured fare, not submitted zero price |
| 4 | Weekly pass with quantity 2 | Unit and total fares calculated correctly |
| 5 | Invalid email / quantity 6 | HTTP 400 validation response |
| 6 | Ticket lookup | Previously stored booking can be retrieved by ticket code |
| 7 | Unknown ticket code | HTTP 404 |
| 8 | Static app and security header | HTML served with `X-Frame-Options: DENY` |

## Run and record actual results

Run:

```bash
npm test
```

The runner prints each test and a final pass/fail summary. This report describes the included automated test cases; fill in the actual date, Node.js version, and console summary after executing tests on the submission machine.

| Item | Result to record |
|---|---|
| Test date | __________________ |
| Node.js version (`node --version`) | __________________ |
| Tests passed | __________________ |
| Tests failed | __________________ |
| Tester | __________________ |

## Manual acceptance test

1. Load the home page at `http://localhost:3000`.
2. Confirm the four routes appear.
3. Select route R101, Single ride, quantity 1. Expected estimate: ₹25.
4. Change to Day pass. Expected estimate: ₹75.
5. Change quantity to 2. Expected total: ₹150.
6. Enter synthetic passenger details and submit.
7. Confirm the UI displays a generated `BP-XXXXXXXXXXXXXXXX` ticket code.
8. Open Find my ticket and retrieve the booking using the code.
9. Try an invalid code; confirm the app displays a useful error.
10. Run `npm test` and confirm all tests pass.

## Known test limitations

- No load/performance test has been executed as part of this package.
- No real payment, login, production database, external email, or transit inventory integration is implemented.
- Multi-instance concurrency and disaster recovery need a managed database and environment-level testing.