import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { adminCredentialsAreConfigured, isAdmin } from "@/lib/auth";

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
  const credentialsConfigured = adminCredentialsAreConfigured();
  return (
    <div className="login-box">
      <h1>破晓管理后台</h1>
      <p>这是非公开的内容管理入口。</p>
      {query.error ? (
        <p className="form-error">
          {query.error === "not-configured"
            ? "服务器尚未初始化后台账号，请联系部署者完成管理员设置。"
            : query.error === "rate-limit"
              ? "尝试次数过多，请十五分钟后再试。"
              : "用户名或密码不正确。"}
        </p>
      ) : null}
      {credentialsConfigured ? (
        <LoginForm />
      ) : (
        <p className="form-error">
          服务器尚未初始化后台账号。部署者需配置 ADMIN_USERNAME、ADMIN_PASSWORD 后运行
          <code>pnpm admin:reset</code>。
        </p>
      )}
    </div>
  );
}
