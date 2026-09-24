import { request } from 'http';
import { soapConn } from '@/config/env';
import { logger } from '@/middleware/request-logger';

// command 注入 SOAP 文本节点：GM 可编辑内容（广播/邮件正文）可能含 & < > 等字符，
// 不转义会破坏请求 XML；worldserver 收到的是反转义后的原文
function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

export class SoapService {
  sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: soapConn.host,
          port: soapConn.port,
          method: 'POST',
          auth: `${soapConn.user}:${soapConn.pass}`,
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              logger.error({ statusCode: res.statusCode, command }, 'SOAP command failed');
              reject(new Error(`SOAP command failed: ${res.statusCode}`));
            } else {
              resolve(data);
            }
          });
        },
      );

      req.on('error', (error) => {
        logger.error({ error, command }, 'SOAP request error');
        reject(error);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('SOAP timeout'));
      });

      req.write(`<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/1999/XMLSchema"
  xmlns:ns1="urn:AC">
  <SOAP-ENV:Body>
    <ns1:executeCommand>
      <command>${escapeXml(command)}</command>
    </ns1:executeCommand>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`);
      req.end();
    });
  }
}

export const soapService = new SoapService();
