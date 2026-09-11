import { SignUp } from "@clerk/nextjs";

import { authDisabled } from "@/env";

export default function SignUpPage() {
  return (
    <main className="container auth-page">
      <div className="auth-fallback">
        <h1>Create account</h1>
        <p>Create an account to create and join forums.</p>
      </div>
      {authDisabled ? null : (
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/timetables"
        />
      )}
    </main>
  );
}
