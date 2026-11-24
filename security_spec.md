# Stockkeep Security Specification

## 1. Data Invariants

1. **Ownership & Isolation**: Every `pantry_items` and `notification_logs` document must carry a `userId` strictly matching `request.auth.uid` on creation and immutable across updates.
2. **PII Protection**: User profile documents at `/users/{userId}` contain email addresses and webhook URLs; `get` is restricted strictly to `request.auth.uid == userId`, and `list` is explicitly denied (`false`).
3. **Verified Identity**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
4. **Schema & Volumetric Bounds**: Every string field enforces strict `.size()` bounds; numeric quantities (`0 <= quantity <= 100000`), `alertThresholdDays` (`1 <= x <= 365`), and `householdSize` (`1 <= x <= 50`) are bounded; `foodGroup`, `status`, `digestFrequency`, `channel`, and `deliveryStatus` are restricted to closed allowlists.
5. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on updates; `updatedAt` must equal `request.time` on creation and updates.
6. **Notification Log Immutability**: Once logged, `notification_logs` cannot be updated from clients; owners may read or delete their own logs.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)

1. **Unauthenticated Pantry Read**: `GET /pantry_items/item-1` with `auth = null`.
2. **Unverified Email Write**: `CREATE /pantry_items/item-1` with `auth.token.email_verified = false`.
3. **Cross-User Spoofing**: `CREATE /pantry_items/item-1` where `userId = "victim_uid"` while `auth.uid = "attacker_uid"`.
4. **Shadow Field Injection**: `CREATE /pantry_items/item-1` with valid fields plus `isAdmin: true` or `shadowRole: "superuser"`.
5. **Blanket User List Scraping**: `LIST /users` as an authenticated user.
6. **Cross-User PII Read**: `GET /users/victim_uid` as `attacker_uid`.
7. **ID Poisoning**: `CREATE /pantry_items/invalid$id!with/spaces` or 200-char ID.
8. **Resource Exhaustion (1MB String)**: `CREATE /pantry_items/item-1` with `name` of 5,000 characters.
9. **Client Timestamp Forgery**: `CREATE /pantry_items/item-1` with `createdAt` set to a past client timestamp instead of `request.time`.
10. **Owner Reassignment on Update**: `UPDATE /pantry_items/item-1` attempting to mutate `userId` or `createdAt`.
11. **Invalid Food Group / Date Format**: `CREATE /pantry_items/item-1` with `foodGroup: "Junk"` or `expirationDate: "11/17/2026"`.
12. **Blanket Collection Query**: `LIST /pantry_items` without `where("userId", "==", auth.uid)`.
