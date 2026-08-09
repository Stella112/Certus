import { post } from './client';

/**
 * Cleanverse Cooperate API v5.4 Fiat Ramp adapter.
 *
 * These endpoints are plain JSON (the ramp module is not AES-encrypted). Keep them here so
 * the rest of Certus never needs to know Cleanverse paths, headers, or envelope semantics.
 */
export type RampSide = 'BUY' | 'SELL';

export interface RampQuoteRequest {
  fiatCurrency: string;
  cryptoCurrency: string;
  isBuyOrSell: RampSide;
  network: string;
  paymentMethod: string;
  fiatAmount?: number;
  cryptoAmount?: number;
  partnerCustomerId?: string;
}

export interface RampQuote {
  quoteToken: string;
  quoteId: string;
  fiatCurrency: string;
  cryptoCurrency: string;
  network: string;
  paymentMethod: string;
  fiatAmount: number;
  cryptoAmount: number;
  totalFee: number;
  feeDecimal?: number;
  conversionPrice?: number;
  slippage?: number;
  isBuyOrSell: RampSide;
  feeBreakdown?: Array<{ id?: string; name?: string; value?: number }>;
  nonce?: number;
}

export interface RampWallet {
  address: string;
  chain: string;
}

export interface RampWidget {
  orderId: string;
  widgetUrl: string;
}

export interface RampOrder {
  orderId: string;
  channelOrderId?: string | null;
  status: string;
  buyOrSell: RampSide;
  fiatCurrency: string;
  fiatAmount: string | number;
  cryptoCurrency: string;
  cryptoAmount: string | number;
  wallet?: RampWallet & { depositAddress?: string | null };
  quote?: Partial<RampQuote>;
  createdAt?: string | null;
  completedAt?: string | null;
}

export const ramp = {
  countries: () => post<unknown[]>('/query_ramp_countries', {}),
  fiatCurrencies: () => post<unknown[]>('/query_ramp_fiat_currencies', {}),
  cryptoCurrencies: () => post<unknown[]>('/query_ramp_crypto_currencies', {}),
  paymentMethods: () => post<unknown[]>('/query_ramp_payment_methods', {}),
  quote: (input: RampQuoteRequest) => post<RampQuote>('/query_ramp_quote', { ...input }),
  widget: (input: { quoteToken: string; wallet: RampWallet; email?: string; userIp?: string }) =>
    post<RampWidget>('/create_ramp_widget_url', { ...input, wallet: { ...input.wallet } }),
  order: (orderId: string) => post<RampOrder>('/query_ramp_order', { orderId }),
};
