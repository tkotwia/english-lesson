import { api } from '../api.ts';
import { LiveTalk, liveTalkSupported } from '../lesson/LiveTalk.tsx';
import { useActiveUser } from '../userContext.tsx';

/**
 * 即時對話:課堂以外的自由對話練習。直接用說的和老師聊一個主題,老師也用聲音回答。
 * 不計分,也不留紀錄;用來多開口、多聽。
 */
export function LiveTrial() {
  const user = useActiveUser();
  return (
    <section className="page lesson">
      <h1>即時對話</h1>
      <div className="card">
        <p>直接用說的和 Emma 老師聊天,老師也用說的回答。這是課堂以外的自由練習:不計分,也不會留下紀錄。</p>
        <ul>
          <li>老師先開口,挑一個主題和你聊。一次可以說 5 輪,程度依你目前的等級({user.level})。</li>
          <li>需要麥克風,以及已經在「設定」頁存好的 API key。</li>
          <li>使用免費額度時,送到 Google 的內容可能被用來改進它的產品,也可能由人工審閱。</li>
        </ul>
        {liveTalkSupported() ? (
          <LiveTalk key={user.id} start={() => api.startLive(user.id)} />
        ) : (
          <p className="alert alert-warn">這個瀏覽器不支援即時語音對話,請改用桌面版 Chrome。</p>
        )}
      </div>
    </section>
  );
}
