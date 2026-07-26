# 10 — Robot–Cloud Boundary

Version: 1.0.0  
Status: Locked integration boundary

## 1. Purpose

Allow the web platform and physical robot to evolve concurrently without sharing runtime code, databases, or deployment assumptions.

## 2. Cloud authority

The cloud is authoritative for:

- admitted human accounts;
- workspaces and memberships;
- global catalog and current price estimates;
- collection balances and transaction history;
- decks;
- device registration, credentials, and grants;
- accepted device sync batches;
- thin run summaries;
- published catalog snapshots.

## 3. Robot authority

The robot is authoritative for:

- local hardware configuration;
- homing and calibration;
- camera and sensor operation;
- image capture and identification execution;
- scan sequencing;
- local bin occupancy during a run;
- deterministic sort/provisioning/movement plans;
- move execution and reconciliation;
- local failure/restart recovery;
- immutable run price snapshots used for planning;
- offline outbound queue.

## 4. Shared identities

The integration contract shares:

- game code;
- oracle-card UUID;
- printing UUID;
- finish;
- condition;
- catalog snapshot version;
- collection UUID;
- device UUID;
- external run ID;
- idempotency key.

The cloud does not need the robot's per-run physical `instance_id` to maintain quantity inventory. A future provenance feature may add per-copy identity through a separate ratified contract.

## 5. Catalog direction

Direction: cloud to robot.

- Cloud worker generates an immutable SQLite snapshot.
- Device downloads and verifies it.
- Device never writes catalog or current prices to the cloud.
- A robot may maintain local image/feature caches derived from snapshot URIs.

## 6. Inventory direction

Primary direction: robot to cloud after local work is safely committed.

- Robot records results locally first.
- Robot queues one idempotent inventory batch.
- Network failure does not roll back physical work.
- Retry continues until cloud accepts or an operator resolves a permanent validation error.
- Cloud applies the batch atomically.
- Successful receipt is stored in the robot outbox state.

## 7. Offline-first behavior

The robot must be able to:

- identify and sort with its installed snapshot;
- complete/recover an active run without cloud connectivity;
- persist all run and outbox state locally;
- retry uploads after restart;
- retain the prior catalog during failed snapshot updates.

The web platform being unavailable must not create an unsafe robot transition.

## 8. Run summaries

Cloud run summaries may include:

- device and collection;
- external run ID;
- catalog snapshot version;
- status: completed, failed, cancelled, partially_posted;
- start/end time;
- total, recognized, unrecognized, and posted quantities;
- safe diagnostic code;
- bounded operator/sort-profile reference if useful.

Cloud run summaries exclude by default:

- movement plans;
- individual move events;
- coordinates;
- motor commands;
- camera frames;
- sensor telemetry;
- live bin occupancy;
- physical restart checkpoints;
- remote motion commands.

## 9. No remote start

The cloud may prepare configuration or show readiness, but it may not command the robot to begin physical motion in the initial architecture.

Any future remote-motion capability requires a separate safety design covering:

- local physical enablement;
- presence/interlock checks;
- command signing and expiry;
- operator identity;
- emergency stop behavior;
- network-loss behavior;
- replay protection;
- hardware certification.

## 10. Collection-aware sorting

A robot may request inventory-read access to a granted collection to support future rules such as copy limits or collection-aware purge behavior.

The cloud response is collection balance data only. Robot sort policy, bin provisioning, and physical decisions remain local.

## 11. Historical robot requirements retained as robot-domain context

The following concepts remain relevant to the separate robot project but do not reshape the cloud schema:

- bins are LIFO stacks;
- scan all cards before final planning/execution;
- correctness outranks bin utilization and move count;
- input and unrecognized bins are system roles;
- unrecognized bin is excluded from normal provisioning;
- sorting uses an ordered composite key;
- local user/run settings may include value tiers, copy handling, and pinned-bin rules;
- local run state must be restart-safe.

Cloud storage may eventually distribute user robot profiles, but the robot must snapshot them locally before use.

## 12. Compatibility policy

- Device API major version and snapshot schema version are independent.
- Manifest states minimum client version and supported schema.
- Server supports a documented compatibility window.
- Device reports its installed versions.
- Unknown fields are ignored only where JSON Schema marks extensibility.
- Breaking snapshot changes publish alongside updated robot code; old compatible snapshot remains available during rollout.

## 13. Integration test suite

Maintain a reference client or fixture suite proving:

- credential auth;
- manifest check/download response;
- checksum verification;
- idempotent inventory upload;
- conflicting replay rejection;
- unknown printing behavior;
- offline retry after simulated restart;
- grant denial;
- revoked credential denial;
- run summary replay;
- no cloud dependency for local execution fixtures.
