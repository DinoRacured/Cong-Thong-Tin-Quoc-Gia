from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from bs4 import BeautifulSoup
import csv
import time

def scrape_procedure_links():
    print('Bắt đầu quá trình thu thập dữ liệu...')
    
    # URL của trang web đã được cập nhật
    url = 'https://dichvucong.danang.gov.vn/dich-vu-cong?p_p_id=dichvucong_WAR_dngdvcportlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1&p_p_col_count=2&_dichvucong_WAR_dngdvcportlet_jspPage=%2Fhtml%2Fdichvucongtructuyen%2Fdanhsachdichvucong.jsp&_dichvucong_WAR_dngdvcportlet_idCoQuan=8'
    
    # Khởi tạo webdriver
    print('Khởi tạo trình duyệt...')
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')  # Chạy ẩn trình duyệt, bỏ đi nếu muốn hiển thị trình duyệt
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    
    driver = webdriver.Chrome(options=options)
    
    try:
        # Truy cập trang web
        print('Đang truy cập trang web...')
        driver.get(url)
        
        # Đợi trang tải xong
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, 'btn-timkiem'))
        )
        
        # Click vào nút "Xem thêm" cho đến khi có đủ 88 thủ tục hoặc không còn nút
        print('Đang nhấp vào nút "Xem thêm" để tải thêm dữ liệu...')
        load_more_attempts = 0
        max_attempts = 20  # Giới hạn số lần để tránh vòng lặp vô hạn
        
        while load_more_attempts < max_attempts:
            # Đếm số thủ tục hiện tại
            current_procedures = len(driver.find_elements(By.CSS_SELECTOR, 'a.btn.btn-timkiem.divThemXoa'))
            print(f'Số thủ tục hiện tại: {current_procedures}')
            
            if current_procedures >= 88:
                print('Đã đạt đủ 88 thủ tục!')
                break
                
            try:
                # Tìm nút "Xem thêm" với id="loadMore" hoặc thẻ span với id="xemThem"
                load_more_button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.ID, 'loadMore'))
                )
                
                # Cuộn xuống để nút hiển thị trong viewport
                driver.execute_script("arguments[0].scrollIntoView();", load_more_button)
                time.sleep(1)  # Đợi cuộn xong
                
                # Click vào nút
                load_more_button.click()
                print(f'Đã nhấp vào nút "Xem thêm" lần thứ {load_more_attempts + 1}')
                
                # Đợi dữ liệu mới tải xong
                time.sleep(3)
                
                load_more_attempts += 1
                
            except TimeoutException:
                print('Không tìm thấy nút "Xem thêm" nữa, có thể đã tải hết dữ liệu.')
                break
            except Exception as e:
                print(f'Lỗi khi nhấp vào nút "Xem thêm": {e}')
                # Thử một phương pháp click khác
                try:
                    driver.execute_script("document.getElementById('loadMore').click();")
                    print("Đã thử nhấp bằng JavaScript")
                    time.sleep(3)
                    load_more_attempts += 1
                except:
                    print("Không thể nhấp vào nút bằng cả hai phương pháp")
                    break
        
        # Lấy HTML sau khi đã tải tất cả dữ liệu
        print('Đang phân tích dữ liệu...')
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        
        # Tìm tất cả thẻ a có class "btn btn-timkiem divThemXoa" và nội dung "Xem chi tiết thủ tục"
        detail_links = soup.find_all('a', class_='btn btn-timkiem divThemXoa', string='Xem chi tiết thủ tục')
        
        print(f'Đã tìm thấy {len(detail_links)} liên kết "Xem chi tiết thủ tục".')
        
        # Thu thập thông tin và lưu vào danh sách
        links = []
        for link in detail_links:
            href = link.get('href')
            if href:
                # Tìm thông tin thủ tục từ thẻ cha
                procedure_name = ""
                department = ""
                
                # Tìm thẻ li chứa thông tin
                parent_li = link.find_parent('li')
                if parent_li:
                    # Tìm tên thủ tục trong lv-tb-td tb-td-2
                    name_div = parent_li.find('div', class_='lv-tb-td tb-td-2')
                    if name_div:
                        procedure_name = name_div.get_text(strip=True)
                    
                    # Tìm tên cơ quan trong lv-tb-td tb-td-4
                    dept_div = parent_li.find('div', class_='lv-tb-td tb-td-4')
                    if dept_div:
                        department = dept_div.get_text(strip=True)
                
                links.append({
                    'procedure_name': procedure_name,
                    'department': department,
                    'href': href
                })
        
        # In một số liên kết mẫu
        for idx, link in enumerate(links[:5]):
            print(f"{idx + 1}. {link['procedure_name']} - {link['href']}")
        
        if len(links) > 5:
            print(f"... và {len(links) - 5} liên kết khác")
        
        # Lưu kết quả vào file CSV
        with open('dichvucong_links.csv', 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['stt', 'procedure_name', 'department', 'href']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for idx, link in enumerate(links):
                writer.writerow({
                    'stt': idx + 1,
                    'procedure_name': link.get('procedure_name', ''),
                    'department': link.get('department', ''),
                    'href': link.get('href', '')
                })
        
        print('Đã lưu kết quả vào tệp dichvucong_links.csv')
        
        # Kiểm tra số lượng link
        if len(links) < 88:
            print(f'Cảnh báo: Chỉ tìm thấy {len(links)} liên kết, ít hơn số lượng yêu cầu (88).')
        else:
            print(f'Thành công! Đã thu thập đủ {len(links)} liên kết.')
        
        return links
        
    finally:
        # Đóng trình duyệt
        driver.quit()
        print('Đã đóng trình duyệt.')

if __name__ == "__main__":
    scrape_procedure_links()
    