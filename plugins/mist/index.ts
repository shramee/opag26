import type { IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { MistIcon } from "./icon";

/**
 * MIST plugin — exposes @opag26/sdk MISTActions as keeperhub agent actions.
 *
 * Mirrors the tool surface from runner/src/tools.ts (the Vercel AI SDK
 * runner used in opag26):
 *
 *   runner tool         → plugin slug
 *   ─────────────────────────────────────────────
 *   generateBlinding    → generate-blinding
 *   requestPayment      → request-payment
 *   payRequest          → pay-request
 *   checkRequestStatus  → check-request-status
 *   showBalance         → show-balance
 *   escrowFund          → escrow-fund
 *   escrowClaim         → escrow-claim
 *
 * sendPeer/finalize are runner orchestration tools and are intentionally
 * not exposed — workflows compose nodes themselves.
 */
const mistPlugin: IntegrationPlugin = {
  type: "mist",
  label: "MIST",
  description:
    "Private MIST.cash payments and OTC escrow swaps using your Para wallet",

  icon: MistIcon,

  // MIST uses the Para wallet as both signer and master key source.
  singleConnection: true,

  // Read-only actions (status, balance) don't require signing.
  // Write actions check for wallet at execution time.
  requiresCredentials: false,

  formFields: [],

  testConfig: {
    getTestFunction: async () => {
      const { testMist } = await import("./test");
      return testMist;
    },
  },

  actions: [
    {
      slug: "generate-blinding",
      label: "Generate Blinding",
      description:
        "Generate a fresh 32-byte BLINDING hex value used to bind an escrow swap. Share with your counterparty before either side calls escrow-fund.",
      category: "MIST",
      stepFunction: "generateBlindingStep",
      stepImportPath: "generate-blinding",
      outputFields: [
        { field: "success", description: "Always true." },
        {
          field: "blinding",
          description: "32-byte hex value (0x-prefixed) suitable for escrow-fund/escrow-claim.",
        },
      ],
      configFields: [],
    },

    {
      slug: "request-payment",
      label: "Create Payment Request",
      description:
        "Create a private MIST payment request the peer can fulfill. Returns the public request fields (secrets/amount/token) and the private claiming key — share only the public fields.",
      category: "MIST",
      stepFunction: "requestPaymentStep",
      stepImportPath: "request-payment",
      outputFields: [
        { field: "success", description: "Whether the request was created." },
        { field: "request.amount", description: "Amount in token base units (string)." },
        { field: "request.token", description: "ERC-20 token address." },
        { field: "request.secrets", description: "Public tx-secret hex — safe to share." },
        { field: "request.claimingKey", description: "PRIVATE — keep secret. Required to withdraw." },
        { field: "request.owner", description: "MIST account address that owns the request." },
        { field: "request.index", description: "Per-master-key request index." },
        { field: "request.status", description: "Always 'PENDING' for a new request." },
        { field: "error", description: "Error message if creation failed." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          showPrivateVariants: true,
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "amount",
          label: "Amount",
          type: "template-input",
          placeholder: "23 or 1.5 or {{NodeName.amount}}",
          example: "1.5",
          required: true,
          helpTip: "Decimal amount; resolved with the token's decimals (default 18).",
        },
        {
          key: "tokenConfig",
          label: "Token",
          type: "token-select",
          networkField: "network",
          required: true,
        },
      ],
    },

    {
      slug: "pay-request",
      label: "Pay Request (Direct Deposit)",
      description:
        "Directly pay (deposit) a previously-shared MIST request. Use only for direct transfers — for the OTC escrow swap, use escrow-fund/escrow-claim instead.",
      category: "MIST",
      requiresCredentials: true,
      stepFunction: "payRequestStep",
      stepImportPath: "pay-request",
      outputFields: [
        { field: "success", description: "Whether the deposit succeeded." },
        { field: "transactionHash", description: "Chamber.deposit tx hash." },
        { field: "transactionLink", description: "Explorer link to the transaction." },
        { field: "error", description: "Error message if the deposit failed." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          showPrivateVariants: true,
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "request",
          label: "Request",
          type: "template-input",
          placeholder: "{{RequestPaymentNode.request}}",
          required: true,
          helpTip: "Public request fields (amount, token, secrets) — typically piped from a peer's request-payment node.",
        },
        {
          type: "group",
          label: "Advanced",
          defaultExpanded: false,
          fields: [
            {
              key: "gasLimitMultiplier",
              label: "Gas Limit",
              type: "gas-limit-multiplier",
              networkField: "network",
              actionSlug: "pay-request",
            },
          ],
        },
      ],
    },

    {
      slug: "check-request-status",
      label: "Check Request Status",
      description:
        "Check whether a MIST request has been paid (PENDING / PAID / WITHDRAWN).",
      category: "MIST",
      stepFunction: "checkRequestStatusStep",
      stepImportPath: "check-request-status",
      outputFields: [
        { field: "success", description: "Whether the status check succeeded." },
        { field: "status", description: "PENDING | PAID | WITHDRAWN." },
        { field: "error", description: "Error message if the check failed." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "request",
          label: "Request",
          type: "template-input",
          placeholder: "{{RequestPaymentNode.request}}",
          required: true,
        },
      ],
    },

    {
      slug: "show-balance",
      label: "Show MIST Balance",
      description:
        "Per-token sum of paid (received), withdrawn, and pending MIST request amounts; also includes on-chain ERC-20 balances for the wallet.",
      category: "MIST",
      stepFunction: "showBalanceStep",
      stepImportPath: "show-balance",
      outputFields: [
        { field: "success", description: "Whether the balance query succeeded." },
        { field: "address", description: "Wallet address scanned." },
        { field: "mist", description: "Array of per-token MIST balance rows." },
        { field: "mist[].token", description: "Token contract address." },
        { field: "mist[].tokenSymbol", description: "Token symbol (if known)." },
        { field: "mist[].paidIn", description: "Sum of PAID requests, raw units." },
        { field: "mist[].withdrawn", description: "Sum of WITHDRAWN requests, raw units." },
        { field: "mist[].pending", description: "Sum of PENDING requests, raw units." },
        { field: "onchain", description: "Array of on-chain ERC-20 balances." },
        { field: "error", description: "Error message if the query failed." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "tokens",
          label: "Tokens",
          type: "template-input",
          placeholder: "dumETH:0x...,dumUSD:0x... or {{NodeName.tokens}}",
          required: false,
          helpTip: "Comma-separated symbol:address pairs. If omitted, only MIST request totals are returned.",
        },
      ],
    },

    {
      slug: "escrow-fund",
      label: "Escrow Fund (Creator Side)",
      description:
        "Creator-side of the OTC escrow protocol. Locks recipientRequest.amount into the escrow contract, bound to the creator's request hash and the recipient's secret. Call only after both sides have shared requests and agreed on a BLINDING value.",
      category: "MIST",
      requiresCredentials: true,
      stepFunction: "escrowFundStep",
      stepImportPath: "escrow-fund",
      outputFields: [
        { field: "success", description: "Whether the escrow funding succeeded." },
        { field: "escrowSecrets", description: "Secrets of the on-chain escrow tx." },
        { field: "amountLocked", description: "Amount locked in escrow (raw units)." },
        { field: "token", description: "Token address that was locked." },
        { field: "transactionHash", description: "Chamber.deposit tx hash for the escrow lock." },
        { field: "transactionLink", description: "Explorer link to the transaction." },
        { field: "error", description: "Error message if escrow funding failed." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          showPrivateVariants: true,
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "escrowAddress",
          label: "Escrow Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.escrowAddress}}",
          required: true,
        },
        {
          key: "creatorRequest",
          label: "Creator Request",
          type: "template-input",
          placeholder: "{{MyRequestNode.request}}",
          required: true,
          helpTip: "YOUR request — what you want to receive from the peer.",
        },
        {
          key: "recipientRequest",
          label: "Recipient Request",
          type: "template-input",
          placeholder: "{{PeerRequestNode.request}}",
          required: true,
          helpTip: "PEER's request — what they want to receive from you.",
        },
        {
          key: "blinding",
          label: "Blinding",
          type: "template-input",
          placeholder: "0x... or {{GenerateBlindingNode.blinding}}",
          required: true,
          helpTip: "Shared 32-byte hex value — must match what the peer uses in escrow-claim.",
        },
        {
          type: "group",
          label: "Advanced",
          defaultExpanded: false,
          fields: [
            {
              key: "gasLimitMultiplier",
              label: "Gas Limit",
              type: "gas-limit-multiplier",
              networkField: "network",
              actionSlug: "escrow-fund",
            },
          ],
        },
      ],
    },

    {
      slug: "escrow-claim",
      label: "Escrow Claim (Recipient Side)",
      description:
        "Recipient-side of the OTC escrow protocol. Pays the creator's request into the chamber and consumes the escrow, releasing the locked funds to your recipient request. Call only after the peer has confirmed escrow-fund succeeded.",
      category: "MIST",
      requiresCredentials: true,
      stepFunction: "escrowClaimStep",
      stepImportPath: "escrow-claim",
      outputFields: [
        { field: "success", description: "Whether the claim succeeded." },
        { field: "transactionHash", description: "Escrow.consumeEscrow tx hash." },
        { field: "transactionLink", description: "Explorer link to the transaction." },
        { field: "error", description: "Error message if the claim failed." },
        { field: "details", description: "Optional extra error details from the SDK." },
      ],
      configFields: [
        {
          key: "network",
          label: "Network",
          type: "chain-select",
          chainTypeFilter: "evm",
          showPrivateVariants: true,
          placeholder: "Select network",
          required: true,
        },
        {
          key: "chamberAddress",
          label: "Chamber Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.chamberAddress}}",
          required: true,
        },
        {
          key: "escrowAddress",
          label: "Escrow Contract",
          type: "template-input",
          placeholder: "0x... or {{NodeName.escrowAddress}}",
          required: true,
        },
        {
          key: "creatorRequest",
          label: "Creator Request",
          type: "template-input",
          placeholder: "{{PeerRequestNode.request}}",
          required: true,
          helpTip: "PEER's request — what they want to receive from you.",
        },
        {
          key: "recipientRequest",
          label: "Recipient Request",
          type: "template-input",
          placeholder: "{{MyRequestNode.request}}",
          required: true,
          helpTip: "YOUR request — what you want to receive from them. Must include the private claimingKey.",
        },
        {
          key: "blinding",
          label: "Blinding",
          type: "template-input",
          placeholder: "0x... or {{GenerateBlindingNode.blinding}}",
          required: true,
          helpTip: "Shared 32-byte hex value — must match what the peer used in escrow-fund.",
        },
        {
          type: "group",
          label: "Advanced",
          defaultExpanded: false,
          fields: [
            {
              key: "gasLimitMultiplier",
              label: "Gas Limit",
              type: "gas-limit-multiplier",
              networkField: "network",
              actionSlug: "escrow-claim",
            },
          ],
        },
      ],
    },
  ],
};

// Auto-register on import
registerIntegration(mistPlugin);

export default mistPlugin;
