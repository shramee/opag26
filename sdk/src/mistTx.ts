import {
	hash2Sync as hash2,
	txSecret as deriveTxSecret,
	hash_with_asset,
	hash3Sync as hash3,
} from '@mistcash/sdk';


export interface MISTTxData {
	amount: bigint;
	token: string;
	secrets: string;
	_key?: string;
	_owner?: string;
	_index?: number;
	_status?: 'PENDING' | 'PAID' | 'WITHDRAWN';
}

/**
 * A private payment request created by the requestor.
 * The public fields (amount, token, secrets) are safe to share.
 * The underscore-prefixed fields are private — only the creator knows them.
 */
export class MISTTx {
	private _data: MISTTxData;

	constructor(data: MISTTxData) {
		this._data = data;
	}

	get amount(): bigint {
		return BigInt(this._data.amount);
	}

	set amount(value: bigint) {
		this._data.amount = value;
	}

	get token(): string {
		return this._data.token;
	}

	set token(value: string) {
		this._data.token = value;
	}

	get secrets(): string {
		return this._data.secrets;
	}

	set secrets(value: string) {
		this._data.secrets = value;
	}

	get _key(): string | undefined {
		return this._data._key;
	}

	set _key(value: string | undefined) {
		this._data._key = value;
	}

	get _owner(): string | undefined {
		return this._data._owner;
	}

	set _owner(value: string | undefined) {
		this._data._owner = value;
	}

	get _index(): number | undefined {
		return this._data._index;
	}

	set _index(value: number | undefined) {
		this._data._index = value;
	}

	get _status(): 'PENDING' | 'PAID' | 'WITHDRAWN' | undefined {
		return this._data._status;
	}

	set _status(value: 'PENDING' | 'PAID' | 'WITHDRAWN' | undefined) {
		this._data._status = value;
	}

	get data(): MISTTxData {
		return {
			amount: this._data.amount,
			token: this._data.token,
			secrets: this._data.secrets,
			_key: this._data._key,
			_owner: this._data._owner,
			_index: this._data._index,
			_status: this._data._status,
		};
	}

	requestTxHash(): string {
		return hash_with_asset(this.secrets, this.token, this.amount.toString());
	}

	requestNullifer(): string {
		const nullifierKey = BigInt(this._key || 0) + 1n;
		const nullifierSecret = hash2(nullifierKey.toString(), this._owner || '0');
		return hash_with_asset(nullifierSecret.toString(), this.token, this.amount.toString());
	}
}
