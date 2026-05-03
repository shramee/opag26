import type { MISTActions } from '@opag26/sdk';

export interface TokenBalance {
	token: string;
	tokenSymbol?: string;
	paidIn: string;
	withdrawn: string;
	pending: string;
	count: { paid: number; withdrawn: number; pending: number };
}

export async function computeBalances(
	mist: MISTActions,
	tokenSymbols: Record<string, string>,
): Promise<TokenBalance[]> {
	await mist.scanPayments();

	const totals = new Map<string, { paid: bigint; withdrawn: bigint; pending: bigint; cP: number; cW: number; cN: number }>();
	for (const req of mist.requests) {
		const key = req.token.toLowerCase();
		let row = totals.get(key);
		if (!row) {
			row = { paid: 0n, withdrawn: 0n, pending: 0n, cP: 0, cW: 0, cN: 0 };
			totals.set(key, row);
		}
		switch (req._status) {
			case 'PAID':
				row.paid += req.amount;
				row.cP += 1;
				break;
			case 'WITHDRAWN':
				row.withdrawn += req.amount;
				row.cW += 1;
				break;
			default:
				row.pending += req.amount;
				row.cN += 1;
		}
	}

	const result: TokenBalance[] = [];
	for (const [token, row] of totals) {
		result.push({
			token,
			tokenSymbol: tokenSymbols[token],
			paidIn: row.paid.toString(),
			withdrawn: row.withdrawn.toString(),
			pending: row.pending.toString(),
			count: { paid: row.cP, withdrawn: row.cW, pending: row.cN },
		});
	}
	return result;
}
