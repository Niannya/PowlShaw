import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { UserLoginForm } from "@/components/account/UserLoginForm";
import { UserLogoutButton } from "@/components/account/UserLogoutButton";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user-auth";

type Props = {
  searchParams: Promise<{
    next?: string;
    username?: string;
    password?: string;
    error?: string;
  }>;
};

export const metadata = { title: "账号登录" };

export default async function LoginPage({ searchParams }: Props) {
  const query = await searchParams;
  // 防止浏览器在脚本尚未加载时，把登录表单误当作 GET 表单并把密码留在地址栏。
  if (typeof query.password === "string" || typeof query.username === "string") redirect("/login");
  const user = await getCurrentUser();
  const nextPath = query.next || "/";
  return (
    <>
      <Breadcrumbs items={[{ label: "账号登录" }]} />
      <div className="page-pad">
        <section className="account-box">
          <h1>账号登录</h1>
          {user ? (
            <>
              <p>
                当前登录为：<strong>{user.display_name}</strong>（{user.username}）
              </p>
              <p className="account-actions">
                <Link href="/account">进入账号中心</Link>
                <Link
                  href={nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/"}
                >
                  返回原页面
                </Link>
                <UserLogoutButton />
              </p>
            </>
          ) : (
            <>
              <p className="muted-note">账号由管理员创建，本站不提供公开注册。</p>
              {query.error ? (
                <p className="form-error">
                  {query.error === "rate-limit"
                    ? "尝试次数过多，请稍后再试。"
                    : "用户名或密码不正确。"}
                </p>
              ) : null}
              <UserLoginForm nextPath={nextPath} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
