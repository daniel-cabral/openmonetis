import { LoginForm } from "@/features/auth/components/login-form";
import { isSignupDisabled } from "@/shared/lib/auth/signup";

export default function LoginPage() {
	return <LoginForm signupDisabled={isSignupDisabled()} />;
}
