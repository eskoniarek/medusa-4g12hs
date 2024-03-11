import { CartService, EventBusService } from '@medusajs/medusa';
import FourG12hsProviderService from 'services/four-g12hs-provider';

class CartSubscriber {
  private paymentProviderService_: FourG12hsProviderService;
  private cartService_: CartService;

  constructor({
    eventBusService,
    cartService,
    paymentProviderService
  }: {
    eventBusService: EventBusService;
    cartService: CartService;
    paymentProviderService: FourG12hsProviderService;
  }) {
    this.cartService_ = cartService;
    this.paymentProviderService_ = paymentProviderService;
    eventBusService.subscribe('cart.customer_updated', this.handleCartUpdate);
  }

  handleCartUpdate = async (cart_id: string): Promise<void> => {
    const cart = await this.cartService_.retrieve(cart_id, {
      select: ['subtotal', 'tax_total', 'shipping_total', 'discount_total', 'total'],
      relations: [
        'items',
        'billing_address',
        'shipping_address',
        'region',
        'region.payment_providers',
        'payment_sessions',
        'customer'
      ]
    });
    if (cart.payment_sessions?.length) {
      // Find 4g12hs Payment Session
      const paymentSession = cart.payment_sessions.find((ps) => ps.provider_id === '4g12hs').data;
      if (paymentSession) {
      //@ts-ignore
        this.paymentProviderService_.updatePayment(paymentSession, cart);
      }
    }
  };
}

export default CartSubscriber;
