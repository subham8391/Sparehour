"use client";
// The account's Default estimate (Settings › Planning, PRODUCT_SPEC.md §9.2): what an unestimated task is counted
// as, which its dashed chip says ("45m?"). The keyboard layer, which reads the settings row anyway, provides it to
// every row; 30 minutes until that row has been read, and wherever no shell is around (tests).
import { createContext } from "react";

export const DefaultEstimate = createContext(30);
