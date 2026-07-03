import dotenv from 'dotenv';
dotenv.config();

const appid = process.env.WX_MINI_APPID;
const secret = process.env.WX_MINI_SECRET;

async function testWeChat() {
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  
  // Test msgSecCheck (version 1)
  const checkUrl = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`;
  const checkBodyBad = {
    content: "特级毛片"
  };
  console.log('Sending bad text check request (v1)...');
  const checkResBad = await fetch(checkUrl, {
    method: 'POST',
    body: JSON.stringify(checkBodyBad),
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Bad text response v1:', await checkResBad.json());
}
testWeChat().catch(console.error);
