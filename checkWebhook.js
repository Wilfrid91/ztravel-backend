// check-webhook.js
import FedaPay from 'fedapay'
import dotenv from 'dotenv'
dotenv.config()

FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
FedaPay.setEnvironment('sandbox') // ou 'live'

async function checkWebhook() {
  try {
    // Récupérer tous les webhooks
    const webhooks = await FedaPay.Webhook.all()
    console.log('Tous les webhooks:', JSON.stringify(webhooks, null, 2))

    // Récupérer le webhook spécifique
    const webhook = await FedaPay.Webhook.retrieve('2448')
    console.log('Détails webhook 2448:', JSON.stringify(webhook, null, 2))
  } catch (error) {
    console.error('Erreur:', error.response?.data || error.message)
  }
}

checkWebhook()
