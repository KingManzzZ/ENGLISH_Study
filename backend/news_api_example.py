import requests
import time
import os
from dotenv import load_dotenv
load_dotenv()


class GuardianMultiSection:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'https://content.guardianapis.com/search'

    def get_multi_section_articles(self, sections, total_per_section=2):
        """
        一次获取多个领域的文章
        :param sections: 领域列表，如 ['technology', 'science', 'business']
        :param total_per_section: 每个领域获取的文章数量
        """
        all_articles = []

        for section in sections:
            print(f"📰 获取 [{section}] 领域文章...")

            params = {
                'section': section,
                'page-size': total_per_section,
                'show-fields': 'bodyText',
                'show-tags': 'keyword',
                'api-key': self.api_key
            }

            try:
                response = requests.get(self.base_url, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()

                for item in data['response']['results']:
                    all_articles.append({
                        'title': item['webTitle'],
                        'content': item['fields'].get('bodyText', ''),
                        'url': item['webUrl'],
                        'section': section,
                        'published': item['webPublicationDate']
                    })

                # 避免请求过快
                time.sleep(1)

            except Exception as e:
                print(f"❌ 获取 [{section}] 失败：{e}")
                continue

        return all_articles


# 使用示例
if __name__ == '__main__':
    API_KEY = os.getenv("NEWS_API_KEY")
    guardian = GuardianMultiSection(API_KEY)

    # 指定多个领域
    sections = ['lifeandstyle', 'sport', 'travel', 'food', 'film', 'music','technology', 'culture', 'education', 'environment', 'books','science', 'business', 'law']

    articles = guardian.get_multi_section_articles(sections, total_per_section=2)

    print(f"\n✅ 共获取 {len(articles)} 篇文章\n")

    # 按领域分组显示
    from collections import defaultdict

    grouped = defaultdict(list)
    for art in articles:
        grouped[art['section']].append(art)

    main()
