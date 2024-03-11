import axios from 'axios';
import * as crypto from 'crypto';
import { EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  AbstractPaymentService,
  Cart,
  Data,
  OrderService,
  Payment,
  PaymentSession,
  PaymentSessionData,
  PaymentSessionStatus
} from '@medusajs/medusa';

interface FourG12hsPaymentPluginOptions {
  merchantId: string;
  testMode?: boolean;
  callbackUrl?: string;
}
interface ExtendedPayment extends Payment {
  paymentSessionId: string; // Add the missing property
  transactionId: string; // Assuming this property stores the transaction ID
}
interface PaymentSessionDataWithTransID extends Data {
  transID: string;
}

class FourG12hsProviderService extends AbstractPaymentService {
  static identifier = '4g12hs';
  private orderService_: OrderService;
  private options_: FourG12hsPaymentPluginOptions;
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;

  constructor({ orderService, manager }, options: FourG12hsPaymentPluginOptions) {
    super({ orderService, manager });

    this.orderService_ = orderService;
    this.manager_ = manager;
    this.transactionManager_ = manager; // Assuming same manager is used for transactions
    this.options_ = options;
  }

  private generateSignature(params: Record<string, string | undefined>, includeEmpty: boolean = false): string {
    const filteredParams = includeEmpty ? params : Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined));
    const baseString = Object.values(filteredParams).join(':');
    const secretKey1 = process.env.SECRET_KEY_1 || '';
    const secretKey2 = process.env.SECRET_KEY_2 || '';
    const concatenatedString = `${baseString}:${secretKey1}:${secretKey2}`;

    return crypto.createHmac('sha256', secretKey1 + secretKey2).update(concatenatedString).digest('hex').toUpperCase();
  }

  async createPayment(cart: Cart): Promise<Data> {
    const amountValue = (cart.total / 100).toString(); // Convert number to string
    const currencyCode = cart.region.currency_code; // Fetch currency code directly from cart's region

    const payload = {
      account: this.options_.merchantId,
      amount: amountValue,
      currency: currencyCode,
      callbackUrl: this.options_.callbackUrl,
    };

    const signature = this.generateSignature(payload);
    payload['signature'] = signature;

    try {
      const response = await axios.post('https://fin.4g12hs.com/api/payment/create', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'OK') {
        const isCartTotalHigh = cart.total > 10000; // Example threshold, adjust as needed
        const idempotencyKey = uuidv4();
        const currentDate = new Date();

        return {
          id: response.data.paymentSessionId,
          status: PaymentSessionStatus.PENDING,
          data: response.data,
          cart_id: cart.id,
          cart: cart,
          provider_id: FourG12hsProviderService.identifier,
          is_selected: isCartTotalHigh,
          idempotency_key: idempotencyKey,
          payment_authorized_at: null,
          created_at: currentDate,
          updated_at: currentDate,
        } as Data;
      } else {
        throw new Error('Payment creation failed with 4g12hs');
      }
    } catch (error) {
      console.error(error);
      throw new Error('Failed to create payment with 4g12hs');
    }
  }

  async retrievePayment(paymentData: Data): Promise<Data> {
    const paymentId = paymentData.id as string; // Type assertion to string
    try {
      const response = await axios.get(`https://fin.4g12hs.com/api/payment/${paymentId}`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'OK') {
        return response.data;
      } else {
        throw new Error('Retrieving payment failed with 4g12hs');
      }
    } catch (error) {
      console.error(error);
      throw new Error('Failed to retrieve payment with 4g12hs');
    }
  }

  async updatePayment(paymentSessionData: Data, cart: Cart): Promise<Data> {
    const paymentId = paymentSessionData.id as string; // Type assertion to string
    const operationType = 'check';
    const payload = {
      opertype: operationType,
      transID: paymentId,
      secret_key_1: process.env.SECRET_KEY_1 || '',
      secret_key_2: process.env.SECRET_KEY_2 || '',
    };
    const signature = this.generateSignature(payload);
    payload['signature'] = signature;

    try {
      const response = await axios.post('https://fin.4g12hs.com/api/payment/operate', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'OK' || response.data.status === 'wait') {
        return response.data;
      } else {
        throw new Error(`Update payment failed with status: ${response.data.status}`);
      }
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update payment with 4g12hs');
    }
  }

  async authorizePayment(paymentSession: PaymentSession): Promise<{ data: Data; status: PaymentSessionStatus; }> {
    const transID = paymentSession.id; // Assuming paymentSession.id holds the transaction ID
    const operationType = 'pay'; // Example operation type, adjust based on actual requirement
    const payload = {
      opertype: operationType,
      account: this.options_.merchantId,
      transID: transID,
      // Include other necessary parameters based on the operation type and requirements
    };

    // Generate the digital signature
    const signature = this.generateSignature({
      ...payload,
      secret_key_1: process.env.SECRET_KEY_1 || '',
      secret_key_2: process.env.SECRET_KEY_2 || '', // Use environment variables directly
    });

    // Add the signature to the payload
    payload['signature'] = signature;

    try {
      // Make the POST request to the 4g12hs API endpoint for payment authorization
      const response = await axios.post('https://fin.4g12hs.com/api/payment/operate', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      // Handle the response
      if (response.data.status === 'OK') {
        // Update the payment session status based on the response
        paymentSession.status = PaymentSessionStatus.PENDING;
        return {
          data: response.data,
          status: PaymentSessionStatus.PENDING,
        };
      } else {
        throw new Error(`Authorization failed with status: ${response.data.status}`);
      }
    } catch (error) {
      console.error(error);
      throw new Error('Failed to authorize payment with 4g12hs');
    }
  }

async capturePayment(payment: Payment): Promise<Data> {
  const paymentSessionId = (payment as ExtendedPayment).paymentSessionId;
  const signatureParams = {
    transID: paymentSessionId,
    opertype: 'capture',
    account: this.options_.merchantId,
  };

  const signature = this.generateSignature(signatureParams);
  try {
    const response = await axios.post('https://fin.4g12hs.com/api/payment/capture', {
      ...signatureParams,
      signature,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      // Ensure paymentSession.data is an object before spreading
      const data = typeof response.data === 'object' ? response.data : {};
      return { ...data, captured: true };
    } else {
      throw new Error('Capture failed with 4g12hs');
    }
  } catch (error) {
    throw new Error('Failed to capture payment with 4g12hs');
  }
}

async refundPayment(payment: ExtendedPayment, refundAmount: number): Promise<Data> {
  const transactionId = payment.transactionId;
  const signatureParams = {
    transID: transactionId,
    amount: refundAmount.toString(),
    opertype: 'refund',
    account: this.options_.merchantId,
  };

  const signature = this.generateSignature(signatureParams);
  try {
    const response = await axios.post('https://fin.4g12hs.com/api/payment/refund', {
      ...signatureParams,
      signature,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      return response.data;
    } else {
      throw new Error(`Refund failed with status: ${response.data.status}`);
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to process refund with 4g12hs');
  }
}

async cancelPayment(payment: ExtendedPayment): Promise<Data> {
  const transactionId = payment.transactionId;

  const signatureParams = {
    transID: transactionId,
    opertype: 'cancel',
    account: this.options_.merchantId,
  };

  const signature = this.generateSignature(signatureParams);
  try {
    const response = await axios.post('https://fin.4g12hs.com/api/payment/cancel', {
      ...signatureParams,
      signature,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      return response.data;
    } else {
      throw new Error(`Cancellation failed with status: ${response.data.status}`);
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to cancel payment with 4g12hs');
  }
}

async deletePayment(paymentSession: PaymentSession): Promise<void> {
  try {
    const paymentSessionId = paymentSession.id; // Extract the session ID from the PaymentSession object
    await axios.delete(`https://fin.4g12hs.com/api/payment/session/${paymentSessionId}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    // Assuming the API does not return any content for a successful delete operation
  } catch (error) {
    console.error(error);
    throw new Error('Failed to delete payment session with 4g12hs');
  }
}

async getPaymentData(paymentSession: PaymentSession): Promise<Data> {
  try {
    const response = await axios.get(`https://fin.4g12hs.com/api/payment/data/${paymentSession.id}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      return response.data;
    } else {
      throw new Error('Failed to retrieve payment data with 4g12hs');
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to fetch payment data with 4g12hs');
  }
}

async getStatus(data: Data): Promise<PaymentSessionStatus> {
  const paymentSessionId = data.id as string; // Cast to string if necessary
  try {
    const response = await axios.get(`https://fin.4g12hs.com/api/payment/status/${paymentSessionId}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      return response.data.paymentStatus as PaymentSessionStatus;
    } else {
      throw new Error('Failed to check payment status with 4g12hs');
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to get payment status with 4g12hs');
  }
}

async updatePaymentData(paymentSessionData: Data, updates: Data): Promise<Data> {
  const payload = {
    transID: paymentSessionData.id,
    ...updates, // Assuming updates is an object containing the fields to be updated
  };

  try {
    const response = await axios.patch(`https://fin.4g12hs.com/api/payment/update`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'OK') {
      return response.data;
    } else {
      throw new Error('Failed to update payment data');
    }
  } catch (error) {
    console.error(error);
    throw new Error('Failed to update payment data with 4g12hs');
  }
}
}

export default FourG12hsProviderService;
