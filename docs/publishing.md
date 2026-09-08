# 发布到 npm

GitHub Actions 会在推送 `v*-beta.*` 标签时运行 Node/Python 测试、发布检查和打包检查，全部通过后用 OIDC 发布到 npm 的 `beta` 标签。标签必须与 package.json 版本一致，提交必须已进入 main。普通 main 提交和 PR 只检查，不发布。

## 一次性绑定

在 npm 包设置的 Trusted Publisher 中选择 GitHub Actions：

- Organization or user：`Anduin9527`
- Repository：`dsh-document-evidence`
- Workflow filename：`publish.yml`
- Environment：留空
- Allowed actions：允许 `npm publish`（直接发布）

也可用已登录且支持 trust 的 npm CLI：

```sh
npm trust github dsh-document-evidence --repo Anduin9527/dsh-document-evidence --file publish.yml --allow-publish --yes
```

这一步需要账户 2FA；成功绑定后，CI 发布无需每次验证，也不需要 NPM_TOKEN secret。仅允许 stage publish 会让每个版本继续等待人工批准，因此本流程选择直接发布。

## 发布下一个测试版

在独立插件仓库 main 上完成修改并提交后执行：

```sh
npm version prerelease --preid=beta
git push origin main --follow-tags
```

`npm version` 同步 package.json 和 lockfile，并创建版本提交与标签。首次从非 beta 版本切换时，显式指定目标版本。版本号不能与已发布版本重复。更新记录应在创建版本前提交。

查看 GitHub Actions 的 **Publish npm beta**。可以在该工作流点击 **Run workflow** 做完整检查；手动运行不会发布。发布完成后可以执行 `npm view dsh-document-evidence dist-tags` 确认 beta 指向新版本。

工作流只维护 beta 标签；目前历史 latest 标签不由本流程调整。不要重新推送已发布版本的标签，npm 不允许覆盖已有版本。稳定版发布需要另行调整版本、标签及发布检查。

参考：[npm 可信发布](https://docs.npmjs.com/trusted-publishers/)。
