import React, { lazy as originalLazy } from "react";

const isDevelopment = process.env.NODE_ENV === "development";

// Custom lazy function
const lazy = (importFunc) => {
  if (isDevelopment) {
    return {
      default: importFunc,
    };
  } else {
    return originalLazy(importFunc);
  }
};

export default lazy;
