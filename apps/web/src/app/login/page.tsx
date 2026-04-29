import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Logo + brand */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Nexus AI</h1>
          <p className="mt-2 text-slate-400 text-sm">
            AI-powered operations platform for modern teams
          </p>
        </div>

        {/* Clerk SignIn component */}
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white/5 backdrop-blur border border-white/10 shadow-2xl rounded-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-slate-400",
              socialButtonsBlockButton:
                "bg-white/10 border border-white/20 text-white hover:bg-white/20",
              dividerLine: "bg-white/10",
              dividerText: "text-slate-400",
              formFieldLabel: "text-slate-300",
              formFieldInput:
                "bg-white/10 border-white/20 text-white placeholder:text-slate-500 focus:border-blue-500",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
              footerActionLink: "text-blue-400 hover:text-blue-300",
            },
          }}
          redirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
