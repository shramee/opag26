from dataclasses import dataclass, field, asdict
from enum import Enum
import uuid
import time


class MsgType(str, Enum):
    SWAP_REQUEST = "SWAP_REQUEST"
    QUOTE = "QUOTE"
    ACCEPT = "ACCEPT"
    COUNTER = "COUNTER"
    CONFIRM = "CONFIRM"
    REJECT = "REJECT"


def _make_id() -> str:
    return str(uuid.uuid4())


def _now() -> float:
    return time.time()


@dataclass
class SwapRequest:
    token_in: str
    amount_in: float
    token_out: str
    max_slippage: float = 0.005
    broker_peer_id: str = ""
    msg_type: str = MsgType.SWAP_REQUEST
    msg_id: str = field(default_factory=_make_id)
    timestamp: float = field(default_factory=_now)


@dataclass
class Quote:
    msg_id: str
    request_id: str
    rate: float
    amount_out: float
    expiry: float
    lp_peer_id: str
    msg_type: str = MsgType.QUOTE
    timestamp: float = field(default_factory=_now)


@dataclass
class Accept:
    quote_id: str
    request_id: str
    msg_type: str = MsgType.ACCEPT
    msg_id: str = field(default_factory=_make_id)
    timestamp: float = field(default_factory=_now)


@dataclass
class Counter:
    request_id: str
    min_rate: float
    msg_type: str = MsgType.COUNTER
    msg_id: str = field(default_factory=_make_id)
    timestamp: float = field(default_factory=_now)


@dataclass
class Confirm:
    request_id: str
    quote_id: str
    escrow_data: dict
    msg_type: str = MsgType.CONFIRM
    msg_id: str = field(default_factory=_make_id)
    timestamp: float = field(default_factory=_now)


@dataclass
class Reject:
    request_id: str
    reason: str = "No deal"
    msg_type: str = MsgType.REJECT
    msg_id: str = field(default_factory=_make_id)
    timestamp: float = field(default_factory=_now)


_MSG_CLASSES = {
    MsgType.SWAP_REQUEST: SwapRequest,
    MsgType.QUOTE: Quote,
    MsgType.ACCEPT: Accept,
    MsgType.COUNTER: Counter,
    MsgType.CONFIRM: Confirm,
    MsgType.REJECT: Reject,
}


def to_dict(msg) -> dict:
    return asdict(msg)


def from_dict(data: dict):
    cls = _MSG_CLASSES.get(data.get("msg_type"))
    if cls:
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})
    return data
