import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

admin.initializeApp();

const db = admin.firestore();

// Import axios for HTTP requests
import axios from "axios";

// Placeholder for createXenditInvoice function
export const createXenditInvoice = functions.firestore
  .document("rentals/{rentalId}")
  .onCreate(async (snap: functions.firestore.DocumentSnapshot, context: functions.EventContext) => {
    const rentalData = snap.data();
    if (!rentalData) {
      console.error("No rental data found");
      return;
    }

    const { amount, userId, id } = rentalData;
    const rentalId = context.params.rentalId;

    try {
      const xenditApiKey = functions.config().xendit.api_key;
      const xenditBaseUrl = "https://api.xendit.co/v2/invoices";

      const invoicePayload = {
        external_id: `rental_${rentalId}`,
        amount: amount,
        payer_email: rentalData.userEmail || "user@example.com",
        description: `Invoice for rental ${rentalId}`,
        success_redirect_url: "https://your-domain.com/dashboard",
        failure_redirect_url: "https://your-domain.com/payment/failure",
        currency: "IDR",
        payment_methods: ["QRIS"],
        invoice_duration: 86400, // 24 hours in seconds
      };

      const response = await axios.post(xenditBaseUrl, invoicePayload, {
        auth: {
          username: xenditApiKey,
          password: "",
        },
      });

      const invoiceData = response.data;

      // Save invoice data to Firestore payments collection
      await db.collection("payments").doc(rentalId).set({
        rentalId,
        xenditInvoiceId: invoiceData.id,
        amount: invoiceData.amount,
        currency: invoiceData.currency,
        status: invoiceData.status,
        invoiceUrl: invoiceData.invoice_url,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Xendit invoice created:", invoiceData.id);
    } catch (error) {
      console.error("Error creating Xendit invoice:", error);
    }
  });

// Placeholder for handleXenditWebhook function
export const handleXenditWebhook = functions.https.onRequest(async (req: Request, res: Response) => {
  const signature = req.headers["x-callback-token"] || req.headers["X-Callback-Token"];
  const webhookToken = functions.config().xendit.webhook_token;

  if (signature !== webhookToken) {
    console.warn("Invalid webhook token");
    res.status(403).send("Forbidden");
    return;
  }

  const event = req.body;

  try {
    if (event.type === "invoice.paid" || event.type === "invoice.expired" || event.type === "invoice.failed") {
      const invoiceId = event.data.id;
      const status = event.data.status;
      const externalId = event.data.external_id;

      // Update payment status in Firestore
      const paymentRef = db.collection("payments").doc(externalId.replace("rental_", ""));
      await paymentRef.update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Payment status updated for invoice ${invoiceId}: ${status}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error handling Xendit webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

export const generateAccessCode = functions.firestore
  .document("payments/{paymentId}")
  .onUpdate(async (change: functions.Change<functions.firestore.DocumentSnapshot>, context: functions.EventContext) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before?.status !== "paid" && after?.status === "paid") {
      const rentalId = context.params.paymentId;
      const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        // Update rental document with access code and status active
        const rentalRef = db.collection("rentals").doc(rentalId);
        await rentalRef.update({
          accessCode,
          status: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Optionally, send email notification here or trigger another function
        console.log(`Access code ${accessCode} generated for rental ${rentalId}`);
      } catch (error) {
        console.error("Error generating access code:", error);
      }
    }
  });

export const sendEmailNotification = functions.firestore
  .document("notifications/{notificationId}")
  .onCreate(async (snap: functions.firestore.DocumentSnapshot, context: functions.EventContext) => {
    const notification = snap.data();
    if (!notification) {
      console.error("No notification data found");
      return;
    }

    // Example: Use a third-party email service like SendGrid or Nodemailer
    // This is a placeholder implementation
    try {
      console.log("Sending email notification:", notification);
      // TODO: Integrate with email service provider here
    } catch (error) {
      console.error("Error sending email notification:", error);
    }
  });

// Placeholder for extendRental function
export const extendRental = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  // TODO: Implement rental extension logic here
  console.log("extendRental called with data:", data);
  return { success: true };
});

// Implement expireRentals function
export const expireRentals = functions.pubsub.schedule("every 5 minutes").onRun(async (context: functions.EventContext) => {
  console.log("expireRentals scheduled function running");
  const now = admin.firestore.Timestamp.now();
  const rentalsRef = db.collection("rentals");
  const expiredQuery = rentalsRef.where("endTime", "<=", now).where("status", "==", "active");
  const expiredSnapshot = await expiredQuery.get();

  const batch = db.batch();

  expiredSnapshot.forEach((docSnap: admin.firestore.QueryDocumentSnapshot) => {
    batch.update(docSnap.ref, { status: "expired", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  await batch.commit();
  console.log(`Expired ${expiredSnapshot.size} rentals`);
});

// Implement syncHardwareStatus function
export const syncHardwareStatus = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    const { lockerId, status, sensorData } = req.body;

    if (!lockerId) {
      res.status(400).send("Missing lockerId");
      return;
    }

    const lockerRef = db.collection("lockers").doc(lockerId);
    await lockerRef.update({
      status: status || "unknown",
      sensorData: sensorData || {},
      lastSync: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error syncing hardware status:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Placeholder for cleanupExpiredData function
export const cleanupExpiredData = functions.pubsub.schedule("every day 00:00").onRun(async (context: functions.EventContext) => {
  // TODO: Implement cleanup of expired data
  console.log("cleanupExpiredData scheduled function running");
});
