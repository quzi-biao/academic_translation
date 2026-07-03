import dotenv from 'dotenv';
dotenv.config();

const appid = process.env.WX_MINI_APPID;
const secret = process.env.WX_MINI_SECRET;

async function testWeChat() {
  console.log(`Testing with AppID: ${appid}`);
  
  // 1. Get Token
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  
  if (tokenData.errcode) {
    console.error('Failed to get token:', tokenData);
    return;
  }
  
  const accessToken = tokenData.access_token;
  console.log(`Got Access Token!`);
  
  // 2. Test msgSecCheck (version 2)
  const checkUrl = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`;
  const checkBody = {
    content: "这是一个正常的测试文本",
    version: 2,
    scene: 2, // 2: discussion/user input
    openid: "oZ2_80O2Q-4q0P7p5g3O9U1Z_Yc4" // 28 chars fake openid
  };
  
  console.log('Sending normal text check request...');
  const checkRes = await fetch(checkUrl, {
    method: 'POST',
    body: JSON.stringify(checkBody),
    headers: { 'Content-Type': 'application/json' }
  });
  
  const checkData = await checkRes.json();
  console.log('Normal text response:', checkData);
  
  // Test bad text
  const checkBodyBad = {
    content: "特级毛片",
    version: 2,
    scene: 2, // 2: discussion/user input
    openid: "oZ2_80O2Q-4q0P7p5g3O9U1Z_Yc4" // 28 chars fake openid
  };
  console.log('Sending bad text check request...');
  const checkResBad = await fetch(checkUrl, {
    method: 'POST',
    body: JSON.stringify(checkBodyBad),
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Bad text response:', await checkResBad.json());
}

testWeChat().catch(console.error);
