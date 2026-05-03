import type { MISTTx } from '@opag26/sdk';

export interface SerializedRequest {
	alias: string;
	amount: string;
	token: string;
	tokenSymbol?: string;
	secrets: string;
	owner: 'self' | 'peer';
}

export interface PeerEnvelope {
	from: string;
	content: string;
	requests?: SerializedRequest[];
	blinding?: string;
}

export interface PeerAck {
	ok: boolean;
	error?: string;
}

export interface RequestEntry {
	alias: string;
	tx: MISTTx;
	owner: 'self' | 'peer';
	tokenSymbol?: string;
}
