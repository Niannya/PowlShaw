import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdmin } from "@/lib/auth";

export const metadata = { title: "管理登录" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string; password?: string; error?: string }>;
}) {
  const query = await searchParams;
  if (typeof query.password === "string" || typeof query.username === "string") {
    redirect("/admin/login");
  }
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="login-box">
      <h1>破晓管理后台</h1>
      <p>这是非公开的内容管理入口。</p>
      {query.error ? (
        <p className="form-error">
          {query.error === "rate-limit"
            ? "尝试次数过多，请十五分钟后再试。"
            : "用户名或密码不正确。"}
        </p>
      ) : null}
      <LoginForm />
    </div>
  );
}
