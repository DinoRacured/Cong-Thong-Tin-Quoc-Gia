const puppeteer = require('puppeteer');

async function test() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log("Navigating to URL...");
    await page.goto('https://dichvucong.gov.vn/thu-tuc-hanh-chinh/019ebaed-c8ba-710e-875e-eae93b73a763', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log("Waiting 5s for JS to render...");
    await new Promise(r => setTimeout(r, 5000));

    console.log("Extracting data...");
    const detailData = await page.evaluate(async () => {
        const data = {};
        const targetFields = [
            "Mã thủ tục", "Số quyết định", "Tên thủ tục", "Cấp thực hiện", "Loại thủ tục",
            "Lĩnh vực", "Trình tự thực hiện", "Cách thức thực hiện", "Thành phần hồ sơ",
            "Đối tượng thực hiện", "Cơ quan thực hiện", "Cơ quan có thẩm quyền",
            "Địa chỉ tiếp nhận HS", "Cơ quan được uỷ quyền", "Cơ quan phối hợp",
            "Kết quả thực hiện", "Căn cứ pháp lý", "Yêu cầu điều kiện thực hiện",
            "Từ khoá", "Mô tả"
        ];
        targetFields.forEach(f => data[f] = "");

        const tableToText = (table) => {
            if (!table) return '';
            const rows = Array.from(table.querySelectorAll('tr'));
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                return "'- " + cells.map(c => c.innerText.trim().replace(/\n/g, ' ')).join(' | ');
            }).join('\n');
        };

        const titleEl = document.querySelector('h3.text-lg.font-semibold');
        if (titleEl) data["Tên thủ tục"] = titleEl.innerText.trim();

        const gridRows = document.querySelectorAll('.flex.flex-col.md\\:flex-row.border-gray-300');
        gridRows.forEach(row => {
            const divs = row.children;
            if (divs.length >= 2) {
                const labelStr = divs[0].innerText.trim();
                const cleanLabel = labelStr.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                const valStr = divs[1].innerText.trim();
                
                const matchedField = targetFields.find(f => {
                    const cleanF = f.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                    return cleanF === cleanLabel || cleanLabel.includes(cleanF) || cleanF.includes(cleanLabel);
                });
                if (matchedField) data[matchedField] = valStr;
            }
        });

        const h4s = document.querySelectorAll('h4');
        h4s.forEach(h4 => {
            const labelStr = h4.innerText.trim();
            const cleanLabel = labelStr.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
            const matchedField = targetFields.find(f => {
                const cleanF = f.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                return cleanLabel.includes(cleanF) || cleanF.includes(cleanLabel);
            });

            if (matchedField) {
                let contentEl = h4.nextElementSibling;
                if (contentEl) {
                    const table = contentEl.tagName === 'TABLE' ? contentEl : contentEl.querySelector('table');
                    if (table) {
                        data[matchedField] = tableToText(table);
                    } else {
                        data[matchedField] = contentEl.innerText.trim();
                    }
                }
            }
        });

        return data;
    });

    console.log(JSON.stringify(detailData, null, 2));
    await browser.close();
}

test().catch(console.error);
