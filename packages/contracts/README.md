# Talence Contracts Package

This workspace packages the five normative machine-readable contracts from the
greenfield canon. Files under `canonical/` must remain byte-identical to their
counterparts under `docs/canonical/Talence_Greenfield_Canon_v1.0.0/contracts/`.

Generated TypeScript types and runtime validators derive from those copies.
Run:

```powershell
npm run validate --workspace @talence/contracts
```

`sync-canonical-contracts.mjs` intentionally copies only from the numbered
canonical package into this workspace. It never writes back into canon.
