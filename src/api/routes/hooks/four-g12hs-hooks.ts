import { OrderService } from '@medusajs/medusa';
import { Request, Response } from 'express';
import FourG12hsProviderService from 'services/four-g12hs-provider';
import * as crypto from 'crypto';

// Assume these are the two parts of your key, replace with actual environment variables or configuration
const secretKey1 = process.env['4G12HS_SECRET_KEY1'];
const secretKey2 = process.env['4G12HS_SECRET_KEY2'];

// Function to generate signature based on 4g12hs documentation
function generateSignature(params: Record<string, string | undefined>, secretKey1: string, secretKey2: string): string {
  // Concatenate your parameters here as per 4g12hs's documentation
  const baseString = [
    params.amount, 
    params.currency, 
    params.orderId,
    // add other parameters required by 4g12hs for the base string
  ].filter(Boolean).join(':');

  const secret = secretKey1 + secretKey2; // Combine your two parts of the secret key
  return crypto.createHmac('sha256', secret).update(baseString).digest('hex').toUpperCase();
}

// Function to validate the signature from 4g12hs webhook
function validateSignature(payload: Record<string, string | undefined>, receivedSignature: string | null): boolean {
  if (!secretKey1 || !secretKey2 || !receivedSignature) return false;

  const generatedSignature = generateSignature(payload, secretKey1, secretKey2);
  return generatedSignature === receivedSignature;
}

export default async (req: Request, res: Response): Promise<void> => {
  const paymentProvider: FourG12hsProviderService = req.scope.resolve('pp_four_g12hs');
  
  const event = req.body;
  const receivedSignature = req.headers['x-4g12hs-signature'] as string | null; // Assuming signature is sent in this header

  // Preparing the payload for signature validation, replace these with actual parameters from your 4g12hs webhook payload
  const payload = {
    amount: event.amount,
    currency: event.currency,
    orderId: event.orderId,
    // add other necessary parameters from the webhook payload
  };

  // Validate signature
  if (validateSignature(payload, receivedSignature)) {
    const orderService: OrderService = req.scope.resolve('orderService');
    const cartId = event.orderId; // Assuming orderId maps to cartId
    const order = await orderService.retrieveByCartId(cartId).catch(() => undefined);

    // Process the event, e.g., capture payment
    if (order && order.payment_status !== 'captured' && event.status === 'SUCCESS') {
      await orderService.capturePayment(order.id);
    }

    res.sendStatus(200); // Acknowledge the webhook
  } else {
    res.status(400).send('Invalid signature');
  }
};
