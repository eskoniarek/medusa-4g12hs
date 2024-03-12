# Medusa Payment 4g12hs
Add 4g12hs as a Payment Provider.



## About
### Description
This Plugin enables to use 4g12hs Payment gateway solution in medusa website to simplify payment from customers. Customers can choose to pay from any credit/debit card, UPI, Netbanking, 4g12hs Wallet and EMI.



## Set up Project

### Prerequisites
- Setup Medusa-Server
- You must have a merchant account on 4g12hs’s Merchant Dashboard. If you are a new merchant and want to create your account.



### Install
- Install Plugin
  ```sh
  npm install medusa-payment-paytm
  ```
- Add to medusa-config.js
  ```js
  {
    resolve: `medusa-payment-4g12hs`,
    options: {
      "merchant_id": "<4g12hs Merchant ID>",
      "merchant_key_1": "<4g12hs Merchant KEY 1>",
      "merchant_key_2": "<4g12hs Merchant KEY 2>",
      "test_mode": "<true or false>", // Optional (Default to false)
      "callback_url": "<Webhook URL>", // Payment Notifcation URL
    },
  }
  ``` 
- Enable `4g12hs` as a payment provider in Medusa admin settings (for Region `IN`)
