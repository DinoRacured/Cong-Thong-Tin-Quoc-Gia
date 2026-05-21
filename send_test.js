const fs = require('fs');

async function sendData() {
    try {
        console.log('Đọc file dichvucong_data.json...');
        if (!fs.existsSync('dichvucong_data.json')) {
            console.log('Không tìm thấy file dichvucong_data.json');
            return;
        }
        
        const rawData = fs.readFileSync('dichvucong_data.json', 'utf8');
        const data = JSON.parse(rawData);
        console.log(`Đã đọc ${data.length} mục. Bắt đầu gửi lên n8n (mỗi lần 10 mục để tránh quota)...`);
        
        const chunkSize = 10;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            const batchNum = Math.floor(i / chunkSize) + 1;
            const totalBatches = Math.ceil(data.length / chunkSize);
            
            console.log(`Đang gửi đợt ${batchNum}/${totalBatches}...`);
            try {
                const response = await fetch('https://n8n.1022.vn/webhook/congthongtinquocgia', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        source: "dvc_danang",
                        total: data.length,
                        batch_info: `${batchNum}/${totalBatches}`,
                        data: chunk
                    })
                });

                if (response.ok) {
                    console.log(`Gửi đợt ${batchNum} thành công!`);
                } else {
                    console.log(`Lỗi khi gửi đợt ${batchNum}: HTTP ${response.status}`);
                }
            } catch (err) {
                console.log(`Lỗi kết nối khi gửi đợt ${batchNum}:`, err.message);
            }
            
            // Chờ 1.5 giây giữa các đợt để đảm bảo tốc độ không vượt quá 50 requests/phút của Google Sheets
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        console.log('Hoàn thành gửi dữ liệu lên n8n!');
    } catch (error) {
        console.error('Lỗi trong quá trình xử lý:', error);
    }
}

sendData();
