import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, sealToBase64 } from "./crypto";
import { openTicket, sealTicket } from "./ticket";

describe("the app's connect ticket", () => {
  const key = Buffer.alloc(32, 7);
  const held = { code: "4/0AX4XfWh-code", state: "eyJ1c2VySWQiOiJ1MSJ9.c2ln" };

  it("round-trips what it was sealed with, and is different every time it is sealed", () => {
    const ticket = sealTicket(held, key);
    expect(openTicket(ticket, key)).toEqual(held);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/); // goes into an address as it is
    expect(sealTicket(held, key)).not.toBe(ticket);
  });

  it("shows nothing of the code or the state", () => {
    const bytes = Buffer.from(sealTicket(held, key), "base64url").toString("latin1");
    expect(bytes).not.toContain("4/0AX4XfWh-code");
    expect(bytes).not.toContain("eyJ1c2VySWQ");
  });

  it("opens nothing that was changed, cut short, or sealed with another key", () => {
    const ticket = sealTicket(held, key);
    // Every seventh character, short of the last one: base64's final character can carry bits that are not data.
    for (let i = 0; i < ticket.length - 1; i += 7) {
      const changed = `${ticket.slice(0, i)}${ticket[i] === "A" ? "B" : "A"}${ticket.slice(i + 1)}`;
      expect(openTicket(changed, key), `character ${i}`).toBeNull();
    }
    expect(openTicket(ticket.slice(0, -4), key)).toBeNull();
    expect(openTicket(ticket.slice(4), key)).toBeNull();
    expect(openTicket(ticket, Buffer.alloc(32, 8))).toBeNull();
  });

  it("has its own key: a ticket is not a stored token, and a value sealed as a stored token is not a ticket", () => {
    const ticket = sealTicket(held, key);
    expect(() => decryptSecret(Buffer.from(ticket, "base64url"), key)).toThrow();
    expect(openTicket(sealToBase64(JSON.stringify({ v: 1, ...held }), key), key)).toBeNull();
    expect(openTicket(encryptSecret(JSON.stringify({ v: 1, ...held }), key).toString("base64url"), key)).toBeNull();
  });

  it("opens nothing that is not a ticket's shape, even when sealed with the right key", () => {
    expect(openTicket(sealTicket({ code: "", state: "s" }, key), key)).toBeNull();
    expect(openTicket(sealTicket({ code: 5 as unknown as string, state: "s" }, key), key)).toBeNull();
    expect(openTicket(sealTicket({ code: "c", state: null as unknown as string }, key), key)).toBeNull();
    for (const notATicket of ["", "x", "x".repeat(9000), null, undefined, 42, {}, [], true]) expect(openTicket(notATicket, key)).toBeNull();
  });
});
