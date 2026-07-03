import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const salesPitch = `
<h2>无限之书渠道 SOP - 客户经理销售话术</h2>

<h3>开场</h3>
<p>您好，我们的产品叫“无限之书”，它不是普通的学习机，也不是把纸质书搬到屏幕上，而是一本可以不断展开的 AI 百科书。孩子从一个问题开始，系统会生成一页内容；如果孩子对某个知识点继续好奇，还能继续展开成新的页面。</p>

<h3>核心卖点</h3>
<ul>
  <li>一本会不断长大的百科书。</li>
  <li>孩子每一次提问，都能长成一页新书。</li>
  <li>适合中小学生，也适合喜欢百科知识的孩子。</li>
  <li>既能看图理解，也能听讲解，还能继续追问。</li>
</ul>

<h3>价值表达</h3>
<p>对家长来说，它解决的是“孩子总在问，但传统书本答不深”的问题。对孩子来说，它把学习变成探索，越问越有内容，越看越想继续看。</p>

<h3>成交引导</h3>
<p>如果您希望孩子少刷无意义内容，多接触有价值的知识，这款产品很合适。它适合放在家里做日常陪伴式学习，也适合孩子自己主动打开探索。</p>
`;

const faq = `
<h2>常见问题解答（FAQ）</h2>

<h3>这是什么产品？</h3>
<p>这是一本可以无限展开的 AI 百科书。它会根据孩子感兴趣的话题生成内容，并支持继续深入探索。</p>

<h3>和平板、学习机有什么区别？</h3>
<p>它更像一本会回应问题的百科书，不是泛娱乐设备。核心是阅读、探索和知识积累，不是刷视频或打游戏。</p>

<h3>适合多大孩子？</h3>
<p>主要适合中小学生，也适合对百科知识有兴趣的家庭成员。</p>

<h3>会不会内容太复杂？</h3>
<p>不会。产品会以孩子能理解的方式呈现知识，尽量图文结合、循序展开。</p>

<h3>后续还要收费吗？</h3>
<p>硬件之外，后续可能有订阅或内容服务权益，具体以官方规则为准。</p>

<h3>出现问题找谁？</h3>
<p>可以联系对应客户经理或售后服务渠道，我们会协助处理设备、支付和使用问题。</p>
`;

const startupGuide = `
<h2>设备开机指南</h2>

<h3>第一步</h3>
<p>接通电源，打开设备。</p>

<h3>第二步</h3>
<p>按照提示完成首次设置，包括网络连接和基础使用确认。</p>

<h3>第三步</h3>
<p>进入首页后，先选择一个孩子感兴趣的话题开始体验。</p>

<h3>第四步</h3>
<p>阅读页面内容，点击或继续追问感兴趣的部分，体验“不断展开”的知识路径。</p>

<h3>第五步</h3>
<p>如果需要帮助，可以联系客户经理或售后。</p>
`;

async function main() {
  const agreements = [
    {
      name: 'sales_pitch',
      title: '客户经理销售话术',
      content: salesPitch
    },
    {
      name: 'faq',
      title: '常见问题解答（FAQ）',
      content: faq
    },
    {
      name: 'startup_guide',
      title: '设备开机指南',
      content: startupGuide
    }
  ];

  for (const a of agreements) {
    await prisma.agreement.upsert({
      where: { name: a.name },
      update: { title: a.title, content: a.content },
      create: a,
    });
    console.log(`Successfully updated ${a.title}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
