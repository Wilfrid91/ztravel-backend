import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

export const sendEmail = async ({ to, subject, text, html, attachments }) => {
  console.log('🔍 DANS sendEmail - Attachments reçus:', {
    type: typeof attachments,
    isArray: Array.isArray(attachments),
    length: attachments?.length,
    firstAttachment: attachments?.[0]
      ? {
          filename: attachments[0].filename,
          contentType: attachments[0].contentType,
          contentLength: attachments[0].content?.length,
          isBuffer: Buffer.isBuffer(attachments[0].content),
        }
      : null,
  })
  try {
    const params = {
      FromEmailAddress: process.env.SMTP_FROM,
      Destination: {
        ToAddresses: [to],
      },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Html: html ? { Data: html } : undefined,
            Text: text ? { Data: text } : undefined,
          },
        },
      },
      Attachments: attachments?.map((att) => ({
        Name: att.filename,
        Data: att.content,
        ContentType: att.contentType,
      })),
    }

    const command = new SendEmailCommand(params)
    const result = await sesClient.send(command)

    console.log('✅ Email envoyé(mailer.js):', result.MessageId)
    return result
  } catch (error) {
    console.error('❌ Erreur SESv2:', error)
    throw error
  }
}

export default SendEmailCommand
