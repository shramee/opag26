import type { PeerAck, PeerEnvelope } from './types.ts';

export async function sendToPeer(peerUrl: string, envelope: PeerEnvelope): Promise<PeerAck> {
	const res = await fetch(`${peerUrl.replace(/\/$/, '')}/message`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(envelope),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		return { ok: false, error: `Peer ${res.status}: ${body || res.statusText}` };
	}
	const json = (await res.json().catch(() => ({}))) as PeerAck;
	return { ok: json.ok ?? true };
}
