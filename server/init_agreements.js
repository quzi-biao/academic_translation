import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const agreements = [
    {
      name: 'terms_of_service',
      title: '用户服务协议',
      content: `本产品面向家庭用户提供知识阅读、内容探索和相关服务。用户在使用前应确认已阅读并理解本协议。<br><br>用户同意：<br>- 仅将产品用于家庭学习和知识探索用途。<br>- 不进行违法、违规或损害他人权益的使用。<br>- 理解内容可能由系统生成，实际使用中应结合家庭教育判断。<br>- 如对购买、退款、售后或服务有疑问，应通过官方渠道联系。<br><br>平台权利：<br>- 有权根据运营需要更新内容、服务规则和使用方式。<br>- 有权对违规使用、异常行为或风险内容进行限制。`
    },
    {
      name: 'privacy_policy',
      title: '隐私政策',
      content: `我们会收集必要信息用于提供服务、账户管理、售后支持、设备识别和体验优化。<br><br>可能涉及的信息包括：<br>- 设备信息<br>- 使用记录<br>- 订单与支付记录<br>- 售后与客服记录<br><br>我们承诺：<br>- 仅为提供服务所必需的目的使用信息。<br>- 不会随意向无关第三方披露个人信息。<br>- 用户可通过官方渠道申请查询、更正或删除相关信息。`
    },
    {
      name: 'child_privacy',
      title: '儿童个人信息保护规则',
      content: `本产品主要面向未成年人家庭场景，平台将尽合理注意义务保护儿童信息安全。<br><br>规则要点：<br>- 仅收集服务必要信息。<br>- 对儿童信息采取更严格的访问和使用控制。<br>- 不会将儿童信息用于与产品无关的营销用途。<br>- 若监护人要求，可依法依规处理相关信息。<br><br>监护人义务：<br>- 监护人应确认孩子在可监督环境下使用产品。<br>- 监护人应理解内容服务的辅助性质，并结合家庭教育进行判断。`
    }
  ];

  for (const a of agreements) {
    await prisma.agreement.upsert({
      where: { name: a.name },
      update: { title: a.title, content: a.content },
      create: a,
    });
    console.log(`Upserted ${a.title}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
