import { hash2Sync as hash2 } from '@mistcash/sdk';
import { strToHex } from './utils';
import { init } from './gnark';

export * from './utils';
export * from './gnark';
export * from './contracts/chamber';
export * from './contracts/escrow';
export * from './proof';
export * as mistcash from '@mistcash/sdk';

export interface RequestMist {
	_key?: string; // only for requestor
	_owner?: string; // only for requestor
	_status?: "PENDING" | "PAID" | "WITHDRAWN"; // only for requestor
	amount: string;
	token: string;
	secrets: string; // h2(key, owner)
}

export class AgentWithMIST {
	masterKey: string;
	txCount = 0;
	masterHidingKey: string;
	accountAuthKey: string;
	accountAddress: string;

	// tracks all payments recieved to the agent
	payments: RequestMist[] = [];

	constructor(masterKey: string) {
		init(); // init gnark WASM on agent creation
		this.masterKey = masterKey;
		this.masterHidingKey = hash2(strToHex('MasterHiding'), masterKey);
		this.accountAuthKey = hash2(strToHex('ownerSecret'), masterKey);
		this.accountAddress = hash2(strToHex('I own this transaction'), this.accountAuthKey);
	}

	// This creates a request for private transaction with derived hiding keys
	requestFunds(amount: string, token: string): RequestMist {
		const request = {
			amount, token, secrets: hash2(String(this.txCount++), this.masterHidingKey)
		};
		this.payments.push(request);
		return request;
	}
}