// Add this inside your switch(action) block in apiHandler:
case "cancelSubscription":
  result = await handleCancelSubscription(payload, req);
  break;