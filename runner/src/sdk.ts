// The @opag26/sdk ESM bundle re-imports @mistcash/sdk via named ESM imports,
// but @mistcash/sdk is published as CommonJS — Node ESM rejects that pattern.
// Until that is fixed upstream we load the SDK through its CJS bundle via
// createRequire. Types still come from the package's .d.ts.

import { createRequire } from 'node:module';
import type * as SdkType from '@opag26/sdk';

const require = createRequire(import.meta.url);
// CJS resolution picks dist/index.cjs via the package's "exports.require" entry.
const sdk: typeof SdkType = require('@opag26/sdk');

export const MISTActions = sdk.MISTActions;
export const MISTTx = sdk.MISTTx;
export const CHAMBER_ABI = sdk.CHAMBER_ABI;
export const ESCROW_ABI = sdk.ESCROW_ABI;

export type MISTActions = SdkType.MISTActions;
export type MISTTx = SdkType.MISTTx;
export type Hex = SdkType.Hex;
