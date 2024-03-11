import { Router } from 'express';
import * as bodyParser from 'body-parser';
import middlewares from '../../middleware';
import fourG12hsHooks from './four-g12hs-hooks'; // Renamed from paytmHooks to fourG12hsHooks

const route = Router();

export default (app: Router): Router => {
  app.use('/4g12hs', route); // Changed from '/paytm' to '/4g12hs'
  route.use(bodyParser.json());
  route.post('/hooks', middlewares.wrap(fourG12hsHooks)); // Use fourG12hsHooks for handling 4g12hs webhooks
  return app;
};
