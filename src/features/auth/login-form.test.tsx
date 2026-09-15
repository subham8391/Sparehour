// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const auth = {
  signInWithOtp: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signInWithOAuth: vi.fn(async () => ({ error: null })),
};
vi.mock("@/data/supabase-browser", () => ({ supabaseBrowser: () => ({ auth }) }));

let googleOn = false;
vi.mock("./providers", () => ({ fetchSignInProviders: vi.fn(async () => ({ google: googleOn })) }));

import { LoginForm } from "./login-form";

describe("<LoginForm>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleOn = false;
    auth.verifyOtp.mockResolvedValue({ error: null });
  });

  it("emails a code, then signs in with it and continues to where the person was going", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/inbox" />);
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
    const call = auth.signInWithOtp.mock.calls[0] as unknown as [{ email: string; options: { emailRedirectTo: string; data: { timezone: string } } }];
    expect(call[0].email).toBe("sam@example.com");
    expect(call[0].options.emailRedirectTo).toMatch(/\/auth\/callback\?next=%2Finbox$/);
    expect(call[0].options.data.timezone).toBeTruthy();

    expect(await screen.findByText(/We sent a code to/)).toBeInTheDocument();
    const code = screen.getByLabelText("Code");
    expect(code).toHaveFocus();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await user.type(code, "12-34-56"); // only digits survive
    expect(code).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "sam@example.com", token: "123456", type: "email" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inbox"));
  });

  it("a wrong code is said plainly, and another can be sent", async () => {
    const user = userEvent.setup();
    auth.verifyOtp.mockResolvedValueOnce({ error: { message: "Token has expired or is invalid" } } as never);
    render(<LoginForm next={null} />);
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(await screen.findByLabelText("Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't match");
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send another" }));
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it("offers Google only when the auth server has it, and sends the person there with the callback", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LoginForm next="/settings" />);
    await screen.findByRole("button", { name: "Email me a code" });
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
    unmount();

    googleOn = true;
    render(<LoginForm next="/settings" />);
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: expect.stringMatching(/\/auth\/callback\?next=%2Fsettings$/) } });
  });

  it("a password still works, an unsafe destination becomes Today, and an error from the link is shown", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="//evil.example" initialError="That sign-in link is incomplete. Ask for a new one." />);
    expect(screen.getByRole("alert")).toHaveTextContent("incomplete");
    await user.click(screen.getByRole("button", { name: "Use a password" }));
    await user.type(screen.getByLabelText("Email"), "dev@sparehour.local");
    await user.type(screen.getByLabelText("Password"), "sparehour");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "dev@sparehour.local", password: "sparehour" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/today"));
  });
});
