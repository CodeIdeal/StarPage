## 项目概览
我想开发一个GitHub page 模板, 用于让github用户能够使用它构建一个用于管理及这是一个通过github page管理并浏览自己github star仓库的github page模板应用。

1. 这个GitHub page能且只能通过GitHub page仓库所有者的github oauth授权。

2. 这个GitHub page在通过oauth授权后可以编辑star仓库的自定义标签tag

3. 这个github page有定时构建任务,构建间隔时间由模板的配置参数决定

   1. 自动构建时会通过实现配置好的带权限限制的pat token通过github api(参见文档:https://docs.github.com/zh/rest/activity/starring?apiVersion=2022-11-28#list-repositories-starred-by-the-authenticated-user)自动拉取用户的所有star仓库信息,并保留UI展示所需的字段(id,fullname,owner.avatar_url, html_url, stargazers_count,forks,open_issues,watchers,description,homepage,updated_at,license.key,topics)以及自定义的tags数组字段,以及备注字段remarks等等到一个json文件并保存到仓库中main分支的src/assets/ data.json文件中。

   2. 仓库的main分支是一个Astro项目用于保存构建渲染页面的源代码

4. 这个github page还有一个deploy分支用于存放通过Astro构建出的静态页面资源

5. main分支的Astro项目需要构建一个单页应用

   1. 页面顶部有个项目logo + 搜索栏 + 排序筛选两个下拉按钮。

   2. 下面左面有一列较小的tag标签列表（3列）,右边是较宽的所有star仓库的卡片列表（4列）。
