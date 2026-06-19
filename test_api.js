const fetch = require('node-fetch');

async function getLinks() {
    console.log("Đang gọi API lấy danh sách...");
    try {
        const response = await fetch('https://dichvucong.gov.vn/api/v1/submitting/formality/list-all-public-formality-by-citizen', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: JSON.stringify({
                "limit": 1000,
                "lastId": "",
                "q": "",
                "categoryId": "",
                "departmentCode": "H17",
                "type": "PROVINCE",
                "level": "PROVINCE",
                "formalityType": "STANDARD"
            })
        });

        const data = await response.json();
        const items = data.data.items || [];
        console.log(`Tìm thấy ${items.length} thủ tục!`);
        items.slice(0, 3).forEach(item => {
            console.log(`- ${item.name} (${item.codeNotation}): https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}`);
        });
        
    } catch (e) {
        console.error(e);
    }
}

getLinks();
