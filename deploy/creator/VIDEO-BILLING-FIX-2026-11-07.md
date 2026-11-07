# CatBee relay video billing hotfix

Target: catbee.online, right application node iZrj97sgqumwizgptmhvzaZ / 172.18.29.102 only.
Candidate version: 2.19.3-creator.2, based on the deployed 2.19.3 Creator source.

## Behavior

- Seedance relay and MiniMax H3 jobs persist an immutable billing snapshot before submission and bind the accepted upstream ID before returning success.
- Background status GETs settle confirmed successful jobs through the existing durable billing journal. A client closing the page or omitting polling no longer prevents settlement. Failed jobs do not charge.
- All new relay jobs, including Creator, settle on confirmed generation success. User-controlled headers, referer and key names cannot select a billing exemption. Legacy Creator snapshots retain their original delivery rule. Creator UI and true 1K dimensions are unchanged.
- The usage request ID column grows from 64 to 255 without truncating stable IDs; migrations 333/334 avoid numbers already used in the local newer upstream candidate.
- SQL outage after acceptance retains a credential-free event in the existing persistent application data volume and retries storage; generation POSTs are never replayed automatically.
- An abrupt process loss between upstream acceptance and receiving/persisting its task ID remains an ambiguous external outcome. Its pre-submission intent is retained for review; it is never guessed as successful or charged. Pending balance holds across async generation are outside this hotfix.

## Checks

- PostgreSQL integration: 75-character incident-shaped request ID, concurrent recovery, canonical usage and money rollback/retry, immutable snapshot conflict and worker lease passed.
- Targeted Go race tests, unit tests for relay/Creator/billing and deployment tool tests passed.
- Frontend: 552 files passed; 5,086 passed and 53 skipped tests. Production build and embedded frontend tests passed.
- Full backend and exact-revision Creator image CI must pass before deployment.

## History and deployment

The seven incident Seedance jobs are not automatically reconstructed or back-charged by this migration. Existing previously staged MiniMax billing events can resume once the ID column is widened; inspect their state/count before and after deployment. No database backup or paid generation test is part of the release.

Use deploy/creator/upstream.py publish --reviewed, ready.py 2.19.3-creator.2, then the installed creator-upgrade command with the verified image digest. Preserve original workspace changes and do not deploy the newer unfinished upstream merge.
