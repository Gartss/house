import HouseApp from './house';
import { getChatGPTUser } from './chatgpt-auth';
import AuthForm from './auth-form';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  if (user) return <HouseApp />;
  return (
    <main className="house-shell">
      <header>
        <span className="private-label">个人空间</span>
      </header>
      <section className="title-row">
        <div>
          <p className="eyebrow">我的房源</p>
          <h1>把每次看房，记清楚。</h1>
        </div>
      </section>
      {!user ? (
        <AuthForm />
      ) : (
        <section className="welcome">
          <h2>还没有房源</h2>
          <p>房源录入功能正在开发，完成后可从手机相册导入截图。</p>
        </section>
      )}
      <footer>房源对比 · 报价历史</footer>
    </main>
  );
}
