import data from "virtual:langle-notices";
import { send } from "../../messaging/client";
import { watchSettings } from "../../messaging/storage";
import { mountPage } from "../../ui/mount-page";
import { NoticesPage } from "./NoticesPage";

mountPage(() => ({
  theme: { send, watchSettings },
  app: <NoticesPage data={data} />,
}));
