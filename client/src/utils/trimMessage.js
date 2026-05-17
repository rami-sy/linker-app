const trimMessage = (message, maxLength = 20) => {
  if (message?.length > maxLength) {
    return message?.substring(0, maxLength) + "...";
  }
  return message;
};

export default trimMessage;
